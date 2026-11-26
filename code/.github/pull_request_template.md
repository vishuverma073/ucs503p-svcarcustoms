## What
<!-- one-paragraph summary -->

## Why
<!-- issue link: Closes #N -->

## How it was tested
- [ ] API: `pnpm typecheck && pnpm test && pnpm build` → result:
- [ ] Storefront: `npx tsc --noEmit && npm test && npm run build` → result:
- [ ] Manual / preview check:

## Risk & rollback
- Restricted paths touched (payments / webhooks / checkout / auth / migrations / prod config)? yes / no
- Needs a DB migration or API deploy before merge? yes / no
- Rollback: revert this PR (storefront: Vercel instant rollback)
