/**
 * Wipe the catalog: every product, every category, and the order/cart rows that
 * reference them. Use to reset the store to an empty state before a real import.
 *
 * Run:  pnpm exec tsx --env-file=.env scripts/wipe-catalog.ts --yes
 *       pnpm exec tsx --env-file=.env scripts/wipe-catalog.ts            (dry run)
 *       pnpm exec tsx --env-file=.env scripts/wipe-catalog.ts --yes --keep-categories
 *       pnpm exec tsx --env-file=.env scripts/wipe-catalog.ts --yes --keep-orders
 *
 * Goes through Supabase's REST endpoint rather than DATABASE_URL: the direct
 * `db.<ref>.supabase.co` host is IPv6-only and unreachable from IPv4-only
 * networks, which is where this script tends to get run from.
 *
 * Deletion order matters — it follows the foreign keys that have no cascade:
 *   orders     → cascades order_items + order_events
 *   cart_items → frees skus (pre-0013 databases have no cascade here)
 *   products   → cascades product_images, dimensions → dimension_values,
 *                skus, product_fitments, product_categories
 *   categories → deepest-first; products.category_id must already be gone
 * Finally home_config's `categories` section is emptied so the storefront home
 * page stops pointing at category ids that no longer exist.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file=.env)");
  process.exit(1);
}

const APPLY = process.argv.includes("--yes");
const KEEP_CATEGORIES = process.argv.includes("--keep-categories");
const KEEP_ORDERS = process.argv.includes("--keep-orders");

const REST = `${SUPABASE_URL}/rest/v1`;
const HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

/** Exact row count for a table, via PostgREST's Content-Range header. */
async function countRows(table: string): Promise<number> {
  const res = await fetch(`${REST}/${table}?select=*&limit=1`, {
    headers: { ...HEADERS, Prefer: "count=exact", Range: "0-0" },
  });
  const range = res.headers.get("content-range");
  const total = range?.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}

/** DELETE every row. PostgREST refuses an unfiltered delete, hence `filter`. */
async function deleteAll(table: string, filter: string): Promise<void> {
  const res = await fetch(`${REST}/${table}?${filter}`, { method: "DELETE", headers: HEADERS });
  if (!res.ok) {
    throw new Error(`DELETE ${table} failed (${res.status}): ${await res.text()}`);
  }
}

const TABLES = [
  "orders",
  "order_items",
  "order_events",
  "carts",
  "cart_items",
  "products",
  "skus",
  "product_images",
  "dimensions",
  "dimension_values",
  "product_fitments",
  "product_categories",
  "categories",
];

async function report(label: string) {
  const counts = await Promise.all(TABLES.map((t) => countRows(t).then((n) => [t, n] as const)));
  console.log(`\n── ${label} ──`);
  for (const [table, n] of counts) console.log(`  ${table.padEnd(20)} ${n}`);
  return Object.fromEntries(counts);
}

await report("Before");

if (!APPLY) {
  console.log("\nDry run. Re-run with --yes to actually delete.");
  process.exit(0);
}

console.log("\nDeleting…");

if (!KEEP_ORDERS) {
  await deleteAll("orders", "id=not.is.null");
  console.log("  orders (+ order_items, order_events)");
}

// Cart lines reference skus directly; clear them so product deletes are unblocked
// even on databases that predate migration 0013.
await deleteAll("cart_items", "id=gte.0");
await deleteAll("carts", "id=not.is.null");
console.log("  carts + cart_items");

await deleteAll("products", "id=gte.0");
console.log("  products (+ skus, images, dimensions, fitments, cross-listings)");

if (!KEEP_CATEGORIES) {
  // categories.parent_id has no cascade, but a single statement defers the
  // NO ACTION check to the end, so one bulk delete handles the whole tree.
  await deleteAll("categories", "id=gte.0");
  console.log("  categories");

  // Drop now-dangling category ids from the home page config.
  const rows = (await (
    await fetch(`${REST}/home_config?select=id,sections`, { headers: HEADERS })
  ).json()) as { id: number; sections: { key: string; config?: Record<string, unknown> }[] }[];
  for (const row of rows) {
    const sections = row.sections.map((s) =>
      s.key === "categories" ? { ...s, config: { ...s.config, categoryIds: [] } } : s,
    );
    await fetch(`${REST}/home_config?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    });
  }
  console.log("  home_config.categories.categoryIds cleared");
}

await report("After");
