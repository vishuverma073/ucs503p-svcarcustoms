![Tiet Logo](assets/tiet-logo.svg){ .tiet-logo }

**UCS503: Software Engineering (Project)**
**TIET Patiala**

# SV Car Customs

An e-commerce platform for vehicle-compatible car accessories, built for a
real Delhi business and live at
[www.svcarcustoms.in](https://www.svcarcustoms.in).

| Roll No.   | Name            | Area of work |
|------------|-----------------|--------------|
| 1024170242 | Vishu Verma     | Payments, checkout, deployment |
| 1024170241 | Raghu Verma     | Backend API, database, authentication |
| 1024170229 | Pratham Sharma  | Storefront and admin UI, mobile layout |
| 1024170231 | Tarush Mohindru | Testing, CI, SEO, documentation |

**Group:** 3Q24, BE Third Year, COPC
**Submitted to:** Ms. Anushka

## What the system does

- **Storefront:** browse by car model and part type, check which cars a part
  fits, save your car in *My Garage*, add variants to the cart, and pay online
  (prepaid, or Cash on Delivery with a 15% online advance). Guests can check
  out without an account.
- **Admin panel:** products, variants, fitment, categories, orders and COD
  collection, promo codes, settings, home page, leads, analytics and an audit
  log.
- **API:** prices every checkout on the server, verifies every PayU payment,
  and reconciles lost payment callbacks every 15 minutes.

## Where things are

| Folder | Contents |
|--------|----------|
| `code/svcar-india` | Next.js storefront and admin panel |
| `code/svcar-api` | Hono REST API, database schema and migrations |
| `project-proposal/` | Project proposal (LaTeX + PDF) |
| `srs/` | Software Requirements Specification v1.1 (LaTeX + PDF) |
| `project-report-prototype-stage/` | Mid-semester report (LaTeX + PDF) |
| `project-report-final/` | Final report (LaTeX + PDF) |
| `journals/` | Weekly journals, one folder per member |
| `docs/` | This site |

## Results at a glance (26 Nov 2026)

- 884 automated tests passing (398 API + 486 storefront), 1 skipped.
- 28 database tables, 22 migrations, 118 commits since 31 May 2026.
- Lighthouse SEO score 100 on the home and category pages.
