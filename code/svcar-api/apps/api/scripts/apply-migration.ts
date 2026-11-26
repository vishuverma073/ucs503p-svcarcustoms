/**
 * Apply a hand-written migration file.
 *
 * Migrations from 0006 onward are hand-authored SQL and are NOT in
 * `migrations/meta/_journal.json`, so `drizzle-kit migrate` skips them. This runs
 * one file directly, splitting on drizzle's `--> statement-breakpoint` marker and
 * wrapping the whole thing in a transaction so a bad statement rolls the rest back.
 *
 * Run:  pnpm exec tsx --env-file=.env scripts/apply-migration.ts 0013_deletable_products.sql
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const file = process.argv[2];
if (!file) {
  console.error("usage: apply-migration.ts <filename.sql>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set (use --env-file=.env)");
  process.exit(1);
}

const path = join(import.meta.dirname, "..", "migrations", file);
const statements = readFileSync(path, "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s && !/^(--[^\n]*\n?)*$/.test(s));

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

console.log(`Applying ${file} — ${statements.length} statement(s)`);
try {
  await sql.begin(async (tx) => {
    for (const [i, stmt] of statements.entries()) {
      const label = stmt.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
      await tx.unsafe(stmt);
      console.log(`  ${i + 1}. ${label}`);
    }
  });
  console.log("Done.");
} catch (err) {
  console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  console.error("Nothing was applied — the transaction rolled back.");
  process.exitCode = 1;
} finally {
  await sql.end();
}
