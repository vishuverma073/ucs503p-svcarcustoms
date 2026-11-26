# Week 2 : Pages blank for search engines

**Team focus this week:** Catalogue and admin panel  
**Work this week:** Server-rendered pages for search engines

## Error

With JavaScript off, the home page showed grey placeholders and product pages were empty skeletons.

## Relevant Context

Data sections were wrapped in `<Suspense>`.

## Key Observation

React streams Suspense content and uses a script to swap it in; without JS the swap never happens.

## Solution

Removed those boundaries so the server sends finished HTML; checked in a headless browser with JS off (48 product links rendered).

**Because** crawlers must get complete HTML without running scripts.
