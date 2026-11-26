/**
 * Scrape a DotPe "Digital Showroom" catalogue into a verbatim JSON archive.
 *
 * DotPe's web console (web.dotpe.in) reads the catalogue from an authenticated
 * REST API on api.dotshowroom.in:
 *
 *   categories:  GET /api/dotk/catalog/getCategories/{storeId}
 *   products:    GET /api/dotk/catalog/getItemsBasicDetails/{storeId}?category_id={id}&page={n}
 *
 * Both need an `auth_token` header. Capture it once from the browser:
 *   web.dotpe.in → open Catalog → DevTools → Network → click any request to
 *   api.dotshowroom.in → Headers → copy the `auth_token` value (and the storeId
 *   in the path). Tokens are short-lived — scrape right after capturing.
 *
 * The storeId is also embedded in the store page: it's `store_id` in the
 * showroom.dotpe.in page's __NEXT_DATA__.
 *
 * Run:
 *   npx tsx scripts/scrape-dotpe.ts --store 8211679 --token <auth_token>
 *
 * Writes `dotpe-data.json` next to this app: { _meta, categories:[], items:[] }.
 * Re-runnable; no database access. Feed it to scripts/import-dotpe.ts.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const API = "https://api.dotshowroom.in/api/dotk/catalog";
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dotpe-data.json");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const storeId = arg("store");
  const token = arg("token");
  if (!storeId || !token) {
    throw new Error(
      "Usage: scrape-dotpe.ts --store <storeId> --token <auth_token>\n" +
        "Capture both from web.dotpe.in DevTools → Network → any api.dotshowroom.in request.",
    );
  }

  const headers = {
    accept: "application/json, text/plain, */*",
    app_os: "web_console",
    app_version: "0.1.0",
    auth_token: token,
    origin: "https://web.dotpe.in",
    referer: "https://web.dotpe.in/",
    "user-agent": "Mozilla/5.0",
  };

  const get = async (url: string) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30000);
    try {
      const r = await fetch(url, { headers, signal: ac.signal });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}: ${JSON.stringify(body).slice(0, 200)}`);
      return body as any;
    } finally {
      clearTimeout(t);
    }
  };

  // 1) categories
  const catRes = await get(`${API}/getCategories/${storeId}`);
  const categories: any[] = catRes?.categories ?? catRes?.data ?? catRes?.items ?? [];
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error(
      `No categories returned — is the token still valid? Response: ${JSON.stringify(catRes).slice(0, 200)}`,
    );
  }
  console.log(`Categories: ${categories.length}`);

  // 2) products per category (paginated), deduped by id
  const byId = new Map<number, any>();
  for (const c of categories) {
    let page = 1;
    let fetched = 0;
    for (let guard = 0; guard < 100; guard++) {
      const res = await get(`${API}/getItemsBasicDetails/${storeId}?category_id=${c.id}&page=${page}`);
      const items: any[] = res?.items ?? [];
      for (const it of items) if (!byId.has(it.id)) byId.set(it.id, it);
      fetched += items.length;
      if (!res?.next_page || items.length === 0) break;
      page++;
      await sleep(250);
    }
    console.log(`  ${String(c.name || c.id).padEnd(20)} expected=${c.active_products ?? "?"} fetched=${fetched}`);
    await sleep(150);
  }

  const items = [...byId.values()];
  const archive = {
    _meta: {
      source: `${API}/getItemsBasicDetails/${storeId}`,
      store_id: storeId,
      captured_at_utc: new Date().toISOString(),
      product_count: items.length,
      category_count: categories.length,
      variant_products: items.filter((i) => (i.variants_count ?? 0) > 0).length,
      how_to_read: "JSON.parse(file) -> { categories:[{id,name}], items:[...] } (DotPe getItemsBasicDetails shape)",
    },
    categories,
    items,
  };
  writeFileSync(OUT, JSON.stringify(archive, null, 2));
  console.log(
    `\n✓ Wrote ${OUT}\n  products=${items.length}  variant-products=${archive._meta.variant_products}  categories=${categories.length}\n\n` +
      "Next:  npx tsx --env-file=.env scripts/import-dotpe.ts        (dry-run)\n" +
      "       npx tsx --env-file=.env scripts/import-dotpe.ts --apply (writes DB)",
  );
}

main().catch((e) => {
  console.error("✗ scrape failed:", (e as Error).message);
  process.exit(1);
});
