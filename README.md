# SV Car Customs — UCS503P Software Engineering Project

An e-commerce platform for vehicle-compatible car accessories, built for a real
Delhi business and live at **[www.svcarcustoms.in](https://www.svcarcustoms.in)**.

Project site (docs, design, viva notes, journals):
**https://vishuverma073.github.io/ucs503p-svcarcustoms**

| Roll No.   | Name            | Area of work |
|------------|-----------------|--------------|
| 1024170242 | Vishu Verma     | Payments, checkout, deployment |
| 1024170241 | Raghu Verma     | Backend API, database, authentication |
| 1024170229 | Pratham Sharma  | Storefront and admin UI, mobile layout |
| 1024170231 | Tarush Mohindru | Testing, CI, SEO, documentation |

Group 3Q24, BE Third Year, COPC — submitted to Ms. Anushka,
Thapar Institute of Engineering and Technology.

This repository follows the
[UCS503P 2026-27 ODD project template](https://github.com/tiet-ucs503/ucs503p-202627odd-template).

## Contents

| Folder | What it holds |
|--------|---------------|
| [`code/`](code) | The full source: `svcar-india` (Next.js storefront + admin) and `svcar-api` (Hono REST API, schema, migrations) |
| [`project-proposal/`](project-proposal) | Project proposal — [PDF](project-proposal/main.pdf) |
| [`srs/`](srs) | Software Requirements Specification v1.1 — [PDF](srs/main.pdf) |
| [`project-report-prototype-stage/`](project-report-prototype-stage) | Mid-semester (prototype) report, revised — [PDF](project-report-prototype-stage/main.pdf) |
| [`project-report-final/`](project-report-final) | Final report — [PDF](project-report-final/main.pdf) |
| [`journals/`](journals) | Weekly ticket-resolution journals, one folder per member |
| [`docs/`](docs) | MkDocs site: requirements, design (UML, DFD, ER), testing, viva preparation |
| [`tex/`](tex) | Shared LaTeX class for the TIET report format |

## The system in one paragraph

Shoppers browse by car model and part type, see which cars each part fits,
save their car in *My Garage*, and pay through PayU — prepaid, or Cash on
Delivery with a 15% online advance; guests can check out without an account.
The owner runs everything from an admin panel: products, variants, fitment,
categories, orders, COD collection, promo codes, settings, analytics and an
audit log. The API prices every checkout from the database, verifies every
payment hash, and reconciles lost payment callbacks every 15 minutes.

**Stack:** TypeScript · Next.js 16 / React 19 on Vercel · Hono on Node.js 20
(Fly.io) · PostgreSQL + Storage on Supabase · Drizzle ORM · PayU · Inngest ·
Vitest · GitHub Actions.

## Results (26 Nov 2026)

- **884 automated tests passing** — 398 API + 486 storefront (1 skipped, needs a live DB).
- 28 database tables, 22 migrations, 118 commits since 31 May 2026.
- Lighthouse SEO 100; full measurements in the final report, Chapter 3.

## Run the code

```bash
# API → http://localhost:8787
cd code/svcar-api
pnpm install && pnpm --filter @svcar/contracts build
pnpm test          # 398 tests
pnpm dev           # needs code/svcar-api/apps/api/.env (see .env.example)

# Storefront → http://localhost:3000 (admin at /admin)
cd code/svcar-india
npm install
npm test           # 486 tests
NEXT_PUBLIC_USE_MOCKS=true npm run dev   # runs without the API
```

No secrets are stored in this repository; every required variable is listed
in the `.env.example` files.

## Build the reports and docs

```bash
brew install tectonic
cd project-report-final && tectonic -X compile main.tex

pip install mkdocs-material mkdocs-literate-nav mkdocs-section-index \
  mkdocs-git-revision-date-localized-plugin mkdocs-git-authors-plugin mkdocstrings-python
mkdocs serve
```

The `mkdocs` workflow publishes the docs site on every push to `master`;
`Code CI` runs the type-checks, tests and builds; `Reports` compiles the LaTeX.
