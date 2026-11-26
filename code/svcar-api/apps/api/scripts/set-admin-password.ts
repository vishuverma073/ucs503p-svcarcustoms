/**
 * Rotate an existing admin's password.
 *
 *   ADMIN_NEW_PASSWORD='...' pnpm admin:password -- --email admin@example.com
 *
 * There is no password-change endpoint in the admin panel, so this script is the
 * supported way to rotate one.
 *
 * The password comes from the environment, never from argv — argv is visible to
 * any other process on the box via `ps`, and lands in shell history. Nothing
 * here ever prints it.
 *
 * Unlike `admin:create`, this only ever UPDATES, and only the password hash. It
 * refuses if the email doesn't match exactly one existing admin, so a typo can
 * never silently create a new account or touch the wrong one.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { loadEnv } from "../src/lib/env.js";
import { users } from "../src/db/schema.js";
import { logAudit } from "../src/lib/audit.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const password = process.env.ADMIN_NEW_PASSWORD;

  if (!email) {
    console.error("Usage: ADMIN_NEW_PASSWORD='...' tsx scripts/set-admin-password.ts --email <email>");
    process.exit(1);
  }
  if (!password) {
    console.error("✗ Set ADMIN_NEW_PASSWORD in the environment (not as a --password flag).");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("✗ Password must be at least 12 characters. This login controls a live store.");
    process.exit(1);
  }

  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { prepare: false });
  const db = drizzle(sql);

  try {
    const matches = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.email, email), eq(users.isAdmin, true)));

    if (matches.length === 0) {
      console.error(`✗ No admin user with email "${email}". Nothing changed.`);
      console.error("  (This script only updates existing admins — use admin:create to add one.)");
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error(`✗ ${matches.length} admins share "${email}". Refusing to guess. Nothing changed.`);
      process.exit(1);
    }

    const target = matches[0]!;
    // 10 rounds, matching admin:create and the cost assumption in the login route.
    const passwordHash = bcrypt.hashSync(password, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, target.id));

    await logAudit(db, {
      actorUserId: target.id,
      action: "admin.password.rotate",
      resourceType: "user",
      resourceId: target.id,
    });

    console.log(`✓ Password updated for ${target.email} (${target.name ?? "no name"}).`);
    console.log("  Existing admin sessions stay valid until their tokens expire.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("✗ set-admin-password failed:", err);
  process.exit(1);
});
