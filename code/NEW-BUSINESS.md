# Standing up a new business

This repo is a white-label e-commerce platform. `svcar` is the first store built
on it. Everything that makes a store *that store* — name, colours, contact
details, tax and shipping rules, SEO copy — lives in one file at the repo root:

> **[`brand.config.ts`](brand.config.ts)**

Edit it, run one command, and both apps re-skin.

---

## The short version

```bash
#  1 · edit the one file
$EDITOR brand.config.ts

#  2 · push it into both apps
npm run brand:apply

#  3 · fill in the secrets (the generator just wrote you two templates)
cp svcar-api/apps/api/.env.brand.example  svcar-api/apps/api/.env
cp svcar-india/.env.brand.example          svcar-india/.env.local

#  4 · create the database
cd svcar-api && pnpm install
pnpm --filter @svcar/api db:migrate      # schema
pnpm --filter @svcar/api store:init      # settings row, from brand.config.ts
pnpm --filter @svcar/api admin:create    # first admin login

#  5 · run it
pnpm dev                                  # API   → :8787
cd ../svcar-india && npm install && npm run dev   # store → :3000
```

`npm run brand:check` verifies the generated files still match the config — worth
putting in CI, so a hand-edit to a generated file can't drift silently.

---

## What `brand:apply` generates

The root config sits outside both build contexts (Fly builds `svcar-api/`,
Vercel builds `svcar-india/`), so neither app can import it directly. The
generator writes committed artifacts inside each app instead. **Never hand-edit
these** — every one carries a "do not edit" header, and the next `brand:apply`
overwrites it.

| Generated file | What it feeds |
|---|---|
| `svcar-api/apps/api/src/config/brand.defaults.ts` | the defaults behind `config/brand.ts` |
| `svcar-india/src/lib/brand.ts` | `BRAND` — the storefront's identity object |
| `svcar-india/src/app/globals.css` | the theme tokens, spliced between `brand:*` markers |
| `svcar-api/apps/api/.env.brand.example` | which secrets the API needs |
| `svcar-india/.env.brand.example` | which secrets the storefront needs |

### The three config layers, in precedence order

1. **env var** — differs per deploy (a staging API pointing at a staging store).
   Never committed.
2. **`brand.config.ts`** — identity. Committed, edited once per business.
3. **the `settings` table** — admin-editable at runtime, no deploy needed.
   Seeded once from the brand config by `store:init`; after that the admin UI
   owns it and re-running `store:init` will not clobber those edits.

So: change the store phone number in the admin UI, not here. Change the accent
colour here, not in `globals.css`.

---

## Two values you set once and never again

Both are derived, not stored, so changing them on a live store rewrites history:

- **`identity.key`** — derives the JWT issuers. Changing it invalidates every
  issued token: all admins and customers are logged out.
- **`commerce.orderPrefix`** — order numbers are hashed from the order's UUID,
  not stored. Changing it renumbers every existing order.

---

## What is *not* generated

`brand:apply` covers identity, colours and config. It does not write your
content. After running it, work through these:

**Assets** — replace the files, keep the paths:
- `svcar-india/public/` — logo, `favicon.ico`, `icon.png`, social image
- `svcar-india/src/app/opengraph-image.tsx` and
  `(store)/product/[slug]/opengraph-image.tsx` — these draw the OG card in code
- `svcar-india/public/uploads/products/` — product photography

**The font** — `next/font` needs a statically analysable import, so the family
name is the one brand value that lives in code. If you change
`theme.fontFamily`, change the matching import in
`svcar-india/src/app/layout.tsx` too. `brand:apply` warns you when they diverge.

**Catalog** — categories, products, and (for a parts business) vehicle fitment
data. Build them in the admin UI, or adapt
`svcar-api/apps/api/scripts/seed-data.ts`. The MSW mocks under
`svcar-india/src/mocks/data/` are demo fixtures — they only matter if you want a
mock preview deploy to look like your business.

**Hand-written copy** — About, Contact, FAQ, Shipping, Refund, Terms, Privacy
under `svcar-india/src/app/(store)/`, plus the header and footer. These are
prose, not config; nobody can generate a founder story.

### Known gap

38 files under `svcar-india/src/` still contain a literal `"SV Car Customs"` or
`svcarcustoms` (mostly the content pages above, the admin shell, and the mock
payment modals). They are being migrated to `BRAND` from
`svcar-india/src/lib/brand.ts` as each page is touched. Until that sweep
finishes, a fork has to grep for both strings and fix what it finds:

```bash
grep -rn "SV Car Customs\|svcarcustoms" svcar-india/src --include="*.ts" --include="*.tsx"
```

The API side is done — `svcar-api/apps/api/src/` has no brand literals left
outside `config/`.

---

## Deploying

- **API → Fly.** Build context is `svcar-api/` (the Dockerfile needs the pnpm
  workspace and the contracts package). Set the secrets from
  `.env.brand.example` with `fly secrets set`.
- **Storefront → Vercel.** Root directory `svcar-india`. Paste the variables
  from `.env.brand.example` into Project → Settings → Environment Variables.
  Keep `NEXT_PUBLIC_USE_MOCKS` unset or `false` in production — MSW must never
  ship to a real store.

Set `CORS_ORIGINS` on the API to the storefront's deployed origin, or the
browser will block every call.
