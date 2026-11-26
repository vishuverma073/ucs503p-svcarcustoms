/**
 * Purge the demo/seed rows the various seed scripts left behind, WITHOUT touching
 * real data. Complements wipe-catalog.ts (which handles products/categories/orders).
 *
 * Run:  pnpm exec tsx --env-file=.env scripts/wipe-seed-data.ts --yes
 *       pnpm exec tsx --env-file=.env scripts/wipe-seed-data.ts            (dry run)
 *
 * Each target is matched by the fingerprint its seed script stamped on the row,
 * so genuine records survive:
 *   analytics_events  visitor_id 'seed-v*'   (real visitors get a random hex id)
 *   whatsapp_leads    visitor_id 'seed-*'
 *   users             @example.com addresses (real admins/customers are not)
 *   otp_codes         all — short-lived login codes, nothing to preserve
 *
 * Deliberately left alone: audit_log (a real record of admin actions),
 * subscribers (real signups), vehicle_makes/vehicle_models (reference data the
 * fitment picker needs), and the non-seed admin users.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file=.env)");
  process.exit(1);
}

const APPLY = process.argv.includes("--yes");
const REST = `${SUPABASE_URL}/rest/v1`;
const HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

/** `*` is PostgREST's wildcard in a `like` filter (it stands in for SQL's `%`). */
const TARGETS = [
  { table: "analytics_events", filter: "visitor_id=like.seed*", what: "seeded pageviews" },
  { table: "whatsapp_leads", filter: "visitor_id=like.seed*", what: "seeded leads" },
  { table: "users", filter: "email=like.*@example.com", what: "seeded customers" },
  { table: "otp_codes", filter: "id=not.is.null", what: "expired login codes" },
];

async function countMatching(table: string, filter: string): Promise<number> {
  const res = await fetch(`${REST}/${table}?${filter}&select=*&limit=1`, {
    headers: { ...HEADERS, Prefer: "count=exact", Range: "0-0" },
  });
  const total = res.headers.get("content-range")?.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}

for (const { table, filter, what } of TARGETS) {
  const n = await countMatching(table, filter);
  if (n === 0) {
    console.log(`${table.padEnd(18)} nothing to remove`);
    continue;
  }
  if (!APPLY) {
    console.log(`${table.padEnd(18)} would delete ${n} ${what}`);
    continue;
  }
  const res = await fetch(`${REST}/${table}?${filter}`, { method: "DELETE", headers: HEADERS });
  if (!res.ok) throw new Error(`DELETE ${table} failed (${res.status}): ${await res.text()}`);
  console.log(`${table.padEnd(18)} deleted ${n} ${what}`);
}

if (!APPLY) console.log("\nDry run. Re-run with --yes to actually delete.");
