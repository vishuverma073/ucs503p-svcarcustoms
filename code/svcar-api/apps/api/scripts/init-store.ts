/**
 * Seed the singleton `settings` row for a new business.
 *
 *   pnpm store:init            # insert if missing, otherwise report and exit
 *   pnpm store:init --force    # overwrite the existing row
 *
 * Values come from src/config/brand.ts (which reads env, falling back to the
 * committed defaults). Run this once, right after migrations, when standing up
 * a fork — see NEW-BUSINESS.md. After this the admin UI owns these values;
 * re-running without --force will not clobber admin edits.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { loadEnv } from "../src/lib/env.js";
import { settings } from "../src/db/schema.js";
import { brand } from "../src/config/brand.js";

const force = process.argv.includes("--force");

async function main() {
  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);

  try {
    const values = {
      id: 1 as const,
      storeName: brand.store.name,
      supportPhone: brand.store.supportPhone,
      supportEmail: brand.store.supportEmail,
      whatsappNumber: brand.store.whatsappNumber,
      storeAddress: brand.store.address,
      // numeric columns round-trip as strings in drizzle/postgres-js
      gstRate: String(brand.store.gstRate),
      shippingFreeAbove: String(brand.store.shippingFreeAbove),
      shippingFlatFee: String(brand.store.shippingFlatFee),
    };

    const [existing] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);

    if (existing && !force) {
      console.log(
        `✓ settings row already exists (store_name: "${existing.storeName}") — nothing to do.\n` +
          "  Pass --force to overwrite it with the values from src/config/brand.ts.",
      );
      return;
    }

    if (existing) {
      await db.update(settings).set(values).where(eq(settings.id, 1));
      console.log(`✓ Overwrote settings for "${values.storeName}".`);
    } else {
      await db.insert(settings).values(values);
      console.log(`✓ Initialised settings for "${values.storeName}".`);
    }

    console.log(
      [
        `  support:  ${values.supportEmail} · ${values.supportPhone}`,
        `  whatsapp: ${values.whatsappNumber}`,
        `  GST ${values.gstRate}% · free shipping above ₹${values.shippingFreeAbove} · flat ₹${values.shippingFlatFee}`,
        `  address:  ${values.storeAddress.line1}, ${values.storeAddress.city} ${values.storeAddress.pincode}`,
        "",
        "Next: create the first admin with `pnpm admin:create`.",
      ].join("\n"),
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("✗ store:init failed:", err);
  process.exit(1);
});
