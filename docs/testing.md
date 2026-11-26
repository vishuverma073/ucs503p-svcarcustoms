# Testing and Results

## Automated tests (run 26 Nov 2026)

| Suite | Test files | Tests | Result |
|-------|-----------:|------:|--------|
| API (`code/svcar-api`) | 56 | 399 | 398 passed, 1 skipped (needs a live database) |
| Storefront (`code/svcar-india`) | 57 | 486 | 486 passed |
| Type-check, both apps | – | – | no errors |

Run them yourself:

```bash
cd code/svcar-api && pnpm install && pnpm --filter @svcar/contracts build && pnpm test
cd code/svcar-india && npm install && npm test
```

The `Code CI` workflow runs the same type-checks, tests and builds on every
push and pull request.

## Kinds of testing

- **Unit:** pricing, promo rules, payment hashes and amounts, OTP limits, cart
  state, category trees, SEO metadata, UI components.
- **Integration:** HTTP requests through the Hono app with test doubles;
  storefront tests against MSW handlers that follow the API contracts; an
  end-to-end checkout script for a running API.
- **Security:** tests derived from an OWASP-mapped catalogue
  (`code/qa/SECURITY-TEST-CATALOG.md`), e.g. a wrong hash or amount can never
  mark an order paid.
- **Performance:** live response times and Lighthouse (below).

## Live measurements (26 Nov 2026)

| Metric | Target | Measured |
|--------|--------|----------|
| Cached page, time to first byte (median of 3) | < 300 ms | 375–437 ms |
| Public API endpoint (median of 5) | < 1 s | 1.26 s |
| Lighthouse mobile LCP, home / category | < 2.5 s | 10.8 s / 9.4 s (lab, throttled) |
| Lighthouse SEO | – | 100 / 100 |
| Lighthouse accessibility | – | 91 / 94 |
| Sitemap URLs / feed items | – | 149 / 95 |

## After launch (Google Search Console, 15 Oct – 11 Nov 2026)

81 clicks, 2,477 impressions, 3.3% CTR, average position 14.8. Most clicks
came from searches for the brand name.
