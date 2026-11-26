# Search, login and 404 pages claimed to be the home page

## Error

Google Search Console showed pages such as search results, login and 404s
being treated as duplicates of the home page.

## Relevant Context

The root Next.js layout set `alternates.canonical = "/"` so that the home page
had a canonical URL. Every page that did not set its own canonical inherited
it.

## Key Observation

A canonical tag tells Google "this page is a copy of that URL". Inherited from
the layout, it told Google that every such page was a copy of `/`.

## Solution

Remove the canonical from the root layout and set it on the home page itself;
every other indexable page sets its own canonical. A test
(`canonical-inheritance.test.ts`) fails if a page inherits the home canonical
again.

**Because** in Next.js metadata set in a layout is inherited by every child
page that does not override it.
