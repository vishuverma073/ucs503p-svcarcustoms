# Staging environment

**Status: designed, not created yet.** The cloud resources need owner dashboard access and secrets.

## Why staging is needed

Today Vercel **Preview** deployments use the same API (`svcar-api-staging` on Fly, which is **production**) and the same Supabase database as the live site. Until staging exists, AI agents and preview builds must use mocks (`NEXT_PUBLIC_USE_MOCKS=true`) and never a real database.

## Target layout

```
Production (unchanged)                    Staging (new)
Vercel Production  (branch main)          Vercel Preview (every other branch)
  -> Fly svcar-api-staging (PROD)           -> Fly svcar-api-dev   (fly.staging.toml)
  -> Supabase prod project                  -> Supabase svcar-staging project
  PayU live, Resend, MSG91, VAPID push      PayU TEST, no SMS, no push, email off
  Inngest prod app                          Inngest separate env (or keys unset)
```

## Owner steps, in order

**0. Safety net**
- Supabase (prod) → Database → Backups. Confirm daily backups exist.
- Take a manual `pg_dump -Fc` and store it encrypted.
- Note the current Vercel production deployment and the current Fly release.

**1. Staging database**
- Create the Supabase project `svcar-staging` in region `ap-south-1`. Free plan; a free project pauses when idle.
- Clone the schema from prod with `pg_dump --schema-only --no-owner --no-privileges`, then apply it to staging with `psql`.
  - **Do not replay migrations 0000–0020.** 0006 onward are hand-written, 0007 inserts template categories, and nothing records which migrations have run.
- Copy catalogue data only (no personal data), using `pg_dump --data-only` with one `-t` per table:
  - categories, products, product_images, product_categories
  - dimensions, dimension_values, skus
  - vehicle_makes, vehicle_models, product_fitments
  - home_config, settings, promo_codes
- **Never copy** users, otp_codes, addresses, carts, cart_items, orders, order_items, order_events, order_backups, subscribers, analytics_events, whatsapp_leads, phone_leads, push subscriptions or audit_log.
- Synthetic data: `pnpm db:seed-orders` against **staging only**, plus fake users with `@example.test` emails.
- In the staging `settings` row, set dummy store email and phone values.
- Create a Storage bucket with the same name.

**2. Staging API**
- Run `fly apps create svcar-api-dev`.
- Set secrets with `fly secrets set -a svcar-api-dev ...` (names in the table below; new values, never copied from prod).
- Deploy with `fly deploy -c fly.staging.toml`. **Never use plain `fly deploy` for staging.**

**3. Inngest**
- Create a separate environment, then sync it to `https://svcar-api-dev.fly.dev/api/inngest`.
- Or leave the Inngest keys unset on staging.

**4. Vercel**
- Go to Settings → Environment Variables. Edit each variable that currently targets *Production and Preview*, and give Preview its own staging value (table below).

**5. Verify**
- A preview URL's network calls go only to `svcar-api-dev.fly.dev`.
- Production still calls `svcar-api-staging.fly.dev`.

## Staging environment variables (names only)

**Fly `svcar-api-dev`:**

| Variable | Rule |
|---|---|
| `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Staging project |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ADMIN_SECRET`, `JWT_ISSUER`, `AUTH_PROXY_SECRET`, `REVALIDATE_SECRET` | **New random values** |
| `STOREFRONT_URL`, `API_PUBLIC_URL`, `CORS_ORIGINS`, `REVALIDATE_URL` | Preview/staging URLs, never the production domain |
| `PAYU_MODE=test`, `PAYU_MERCHANT_KEY`, `PAYU_MERCHANT_SALT` | PayU **test** keys |
| `PAYMENT_PROVIDER` | `payu` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Unset (no email), or a sandbox key that only sends to a team inbox |
| `MSG91_*`, `SLACK_WEBHOOK_URL`, `RAZORPAY_*` | **Unset** |
| `VAPID_*` | Unset, or a new staging key pair |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Staging Inngest environment, or unset |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Separate free database, or unset (the code falls back to memory) |

**Vercel, Preview scope:**
- `NEXT_PUBLIC_API_URL`: the staging API URL.
- `AUTH_PROXY_SECRET` and `REVALIDATE_SECRET`: the staging values.
- `NEXT_PUBLIC_SITE_URL`: the preview URL.
- `NEXT_PUBLIC_USE_MOCKS=false` and `NEXT_PUBLIC_MOCK_PAYMENTS=false`.
- `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID` and Google Ads IDs: **unset**.

## Migration rule from now on

1. Write `00NN_x.sql`. It is a restricted path, so a human must approve it.
2. Apply it to **staging**: `pnpm exec tsx --env-file=.env.staging scripts/apply-migration.ts 00NN_x.sql`.
3. Test on a preview deployment.
4. The owner applies it to prod: SQL editor, or the same script with the prod env.
5. Then deploy the API build that needs it.

## Backup and rollback

| What | Backup | Rollback |
|---|---|---|
| Prod database | Supabase daily backups, plus `pg_dump -Fc` before each prod migration | Supabase restore, or `pg_restore` of selected tables. Hand-written migrations ship a `down` snippet in the PR. |
| Storefront | Vercel keeps every deployment | Vercel → Deployments → previous one → Instant Rollback |
| API | Fly release images | `fly releases -a svcar-api-staging`, then `fly deploy -a svcar-api-staging --image <previous>` |
| Staging | Not needed | Rebuild using steps 1–2 |

## Follow-ups (code, need human review)

- **Startup guard:** refuse to boot if `APP_TIER=staging` while `PAYU_MODE=live`, or if `DATABASE_URL` points at the prod project. This touches `src/lib/env.ts`, a restricted path.
- **Email/SMS allowlist on staging:** only `@example.test` addresses and the team inbox.
- **Migration tracking:** a `schema_migrations` table recording applied files.
