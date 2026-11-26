/**
 * Find an IPv4-reachable DATABASE_URL.
 *
 * `db.<ref>.supabase.co` is IPv6-only, so on an IPv4-only network the API and
 * every drizzle script die with ENETUNREACH. Supabase's connection pooler is
 * dual-stack, but its hostname embeds a region that isn't recorded anywhere in
 * the repo — so probe the plausible ones and print the first that authenticates.
 *
 * Run:  pnpm exec tsx --env-file=.env scripts/find-pooler-url.ts
 *
 * Prints the working URL with the password masked; pass --show to print it in
 * full so it can be pasted into .env.
 */
import postgres from "postgres";

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL not set (use --env-file=.env)");
  process.exit(1);
}

const direct = new URL(raw);
// db.<ref>.supabase.co → <ref>
const ref = direct.hostname.replace(/^db\./, "").split(".")[0];
const password = decodeURIComponent(direct.password);

// Session mode (5432) rather than transaction mode (6543): it supports the
// DDL and advisory locks that drizzle-kit migrate needs.
const REGIONS = [
  "ap-south-1",
  "ap-southeast-1",
  "us-east-1",
  "us-west-1",
  "eu-central-1",
  "eu-west-2",
  "ap-northeast-1",
  "ap-southeast-2",
];

function poolerUrl(host: string): string {
  const u = new URL(raw!);
  u.hostname = host;
  u.port = "5432";
  u.username = `postgres.${ref}`;
  u.password = encodeURIComponent(password);
  return u.toString();
}

let found: string | null = null;

for (const region of REGIONS) {
  // Supabase has moved between these two prefixes; try both.
  for (const host of [`aws-0-${region}.pooler.supabase.com`, `aws-1-${region}.pooler.supabase.com`]) {
    const url = poolerUrl(host);
    const sql = postgres(url, { prepare: false, connect_timeout: 8, max: 1, idle_timeout: 2 });
    try {
      const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM products`;
      console.log(`✓ ${host} — connected (products: ${row.n})`);
      found = url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${host} — ${msg.slice(0, 70)}`);
    } finally {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
    if (found) break;
  }
  if (found) break;
}

if (!found) {
  console.error("\nNo pooler host worked. Check the project region in the Supabase dashboard.");
  process.exit(1);
}

const masked = found.replace(/:\/\/([^:]+):[^@]*@/, "://$1:****@");
console.log(`\nWorking DATABASE_URL:\n  ${process.argv.includes("--show") ? found : masked}`);
