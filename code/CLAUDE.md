# SV Car Customs: rules for Claude

Monorepo for www.svcarcustoms.in, an Indian aftermarket car-accessories store.

| Folder | What | Package manager | Hosting |
|---|---|---|---|
| `svcar-india/` | Next.js 16 storefront and `/admin` panel | npm | Vercel (production auto-deploys from `main`) |
| `svcar-api/` | Hono API, Drizzle, Postgres (Supabase), PayU, Inngest | pnpm 9 | Fly.io app `svcar-api-staging`. **This app is production despite its name.** |

## Hard rules (never break these)

1. **Never push to `main`.** Work on a branch named `claude/<issue>-<slug>` or `ai/<slug>`, and open a pull request.
2. **Never deploy.** Don't run `fly deploy`, `vercel --prod`, `vercel redeploy` or `vercel promote`, and don't use any production API.
3. **Never read or change production secrets.** This covers Fly secrets, Vercel production env vars and `.env*` files with real values.
4. **Never access production customer data or the production database.** Use mocks (`NEXT_PUBLIC_USE_MOCKS=true`) or the staging database (see `docs/devops/STAGING.md`).
5. **Never write or run a database migration without explicit human approval** in the issue or PR.
6. **Never merge a PR**, including your own.
7. **Payments, webhooks, checkout, auth and production config need human review.** You may propose changes to them, but label the PR `needs-human-review` and explain the risk.
8. **Always run the relevant tests** (commands below) before opening or updating a PR. Report the results in the PR.
9. **Document every change.** The PR body must say what changed, why, how it was tested, and the risks and rollback.
10. Don't add fake reviews, ratings, testimonials, stock counts or claims the business hasn't confirmed.

## Restricted paths (the PR must be labelled `needs-human-review`)

- Payments: `svcar-api/apps/api/src/routes/payments.ts`, `src/lib/payu.ts`, `src/inngest/functions/reconcile-*`
- Webhooks: `svcar-api/apps/api/src/routes/webhooks.ts`
- Checkout: `svcar-api/apps/api/src/routes/checkout.ts`, `guest-checkout.ts`, `svcar-india/src/app/(store)/checkout/`
- Auth: `svcar-api/apps/api/src/routes/auth.ts`, `src/lib/jwt.ts`, `svcar-india/src/app/auth/`, `svcar-india/src/app/api/`
- Database: `svcar-api/apps/api/migrations/`, `svcar-api/apps/api/src/db/`
- Production config: `svcar-api/fly.toml`, `Dockerfile`, `src/lib/env.ts`, `svcar-india/vercel.json`, `next.config.ts`, `.github/`, `CLAUDE.md`, `.claude/`

`.github/CODEOWNERS` lists the same paths.

## Commands (these are the ones CI runs)

```bash
# API
cd svcar-api && pnpm install --frozen-lockfile
pnpm --filter @svcar/contracts build
pnpm typecheck && pnpm test && pnpm build

# Storefront
cd svcar-india && npm ci
npx tsc --noEmit && npm test && npm run build

# Brand files in sync
node scripts/apply-brand.ts --check
```

- `npm run lint` in `svcar-india` currently has pre-existing errors. Don't add new ones.
- Local storefront without a backend: `NEXT_PUBLIC_USE_MOCKS=true npm run dev`.

## Project conventions worth knowing

- **Money is in integer paise on the server.** The server always recomputes prices; never trust a client total.
- **Migrations:**
  - 0000–0005 are in the drizzle journal.
  - **0006 onward are hand-written SQL**, applied one file at a time with `scripts/apply-migration.ts`.
  - Never replay 0007, which inserts template categories.
  - A migration must be applied **before** the API build that depends on it (see the 0016 header).
- **Structured data:** `svcar-india/src/lib/structured-data.ts` and `product-jsonld.ts`. It must match what pages actually say, including shipping text on `/shipping`.
- **Caching:** pages use long ISR windows (product, category and shop: 24 h; home: 1 h). These were tuned for Vercel Hobby CPU limits, so don't lower them casually.
- **Business facts:**
  - Delivery is free on all orders.
  - COD takes a 15% online advance.
  - No returns.
  - Handling is 1–2 days and transit 5–7 days.
- **Brand:**
  - Brand/name settings come from `brand.config.ts`; run `npm run brand:apply` after editing it.
  - Replica products (Akrapovic/Remus style) must not be labelled as genuine brands.

## Working on an issue

1. Read the issue and restate the goal in one line.
2. Find the relevant code before editing.
3. Make the smallest change that solves the issue. Don't refactor unrelated code.
4. Add or update tests.
5. Run the commands above for every app you touched, and fix failures.
6. Open a PR against `main` with the template in `docs/devops/AI-WORKFLOW.md`. Link the issue with `Closes #N`.

Specialist agents live in `.claude/agents/`. The coordinator reviews their output, and no two agents edit the same file in parallel.
