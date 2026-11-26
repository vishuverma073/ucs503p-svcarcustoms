/**
 * Import a scraped DotPe catalogue (dotpe-data.json) into products/skus/
 * product_images/categories.
 *
 * Reads the "retail" shape produced by scrape-dotpe.ts (DotPe's
 * getItemsBasicDetails endpoint): { categories:[{id,name}], items:[{ name, price,
 * discounted_price, category:{id}, images:[{image_url}], item_option_variants, ...}] }.
 *
 *   - DRY-RUN by default: prints the plan (counts + category list + samples),
 *     writes nothing. Pass --apply to actually insert.
 *   - status = 'draft' so nothing shows on the storefront until you publish it.
 *   - images copied cdn.dotpe.in -> Supabase Storage (product-images/imports/dotpe/*).
 *   - variants (item_option_variants, e.g. Colour: Red/Black/Blue) become one SKU
 *     each + a dimension; variant pricing falls back to the base price (DotPe's
 *     basic-details endpoint doesn't expose per-variant prices).
 *   - idempotent: a product whose exact name already exists is skipped, so
 *     re-runs and partial failures are safe. Never wipes.
 *   - imported products are tagged 'dotpe-import' for easy admin filtering.
 *
 * Run:
 *   npx tsx --env-file=.env scripts/import-dotpe.ts           # dry-run
 *   npx tsx --env-file=.env scripts/import-dotpe.ts --apply   # write
 *   LIMIT=20 npx tsx --env-file=.env scripts/import-dotpe.ts --apply
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.env.LIMIT ?? 0);
const IN = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dotpe-data.json");

const DB = process.env.DATABASE_URL ?? "";
const SB = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!DB) throw new Error("DATABASE_URL missing");
if (APPLY && (!SB || !KEY)) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (needed for image upload)");

// ─── DotPe retail shapes (getItemsBasicDetails) ──────────────
type DpCat = { id: number; name: string; active_products?: number };
type DpImage = { image_url?: string };
type DpOptionValue = { variant_name?: string };
type DpItem = {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  discounted_price?: number;
  available?: number;
  category?: { id?: number } | null;
  image_url?: string | null;
  images?: DpImage[] | null;
  item_option_variants?: Array<Record<string, DpOptionValue[]>> | null;
  variants_count?: number;
  brand_name?: string | null;
};

function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 70)
      .replace(/^-+|-+$/g, "") || "product"
  );
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 25000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

const EXT_BY_CT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Download from DotPe, upload to Supabase, return public URL (or null on failure). */
async function copyImage(srcUrl: string, keyBase: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const dl = await fetchWithTimeout(srcUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!dl.ok) throw new Error(`download ${dl.status}`);
      const ct = (dl.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const ext = EXT_BY_CT[ct] ?? "jpg";
      const buf = Buffer.from(await dl.arrayBuffer());
      if (buf.length < 100) throw new Error("empty image");
      const key = `${keyBase}.${ext}`;
      const up = await fetchWithTimeout(`${SB}/storage/v1/object/product-images/${key}`, {
        method: "POST",
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          "Content-Type": EXT_BY_CT[ct] ? ct : "image/jpeg",
          "x-upsert": "true",
        },
        body: buf,
      });
      if (!up.ok) throw new Error(`upload ${up.status} ${await up.text().catch(() => "")}`.slice(0, 120));
      return `${SB}/storage/v1/object/public/product-images/${key}`;
    } catch (e) {
      if (attempt === 1) {
        console.warn(`  ! image failed (${(e as Error).message}) for ${keyBase}`);
        return null;
      }
    }
  }
  return null;
}

/** reg/sale from DotPe price (MRP) + discounted_price (selling). */
function prices(it: DpItem): { reg: number; sale: number | null } {
  const reg = Number(it.price) || 0;
  const dp = Number(it.discounted_price) || 0;
  return dp > 0 && dp < reg ? { reg, sale: dp } : { reg, sale: null };
}

/** Image URLs for a product: full-size images[] first, else the primary image_url. */
function imageUrls(it: DpItem): string[] {
  const arr = (it.images ?? []).map((i) => i?.image_url).filter((u): u is string => !!u);
  if (arr.length) return arr;
  return it.image_url ? [it.image_url] : [];
}

/**
 * Parse item_option_variants into { dimension name, values[] }. DotPe stores it
 * as [{ "Colour": [{variant_name:"Red"}, ...] }]. All observed products use a
 * single option group; if several ever appear we take the first and warn.
 */
function variantOptions(it: DpItem): { name: string; values: string[] } | null {
  const groups = it.item_option_variants;
  if (!Array.isArray(groups) || groups.length === 0) return null;
  const first = groups[0];
  const name = Object.keys(first)[0];
  if (!name) return null;
  const values = (first[name] ?? [])
    .map((v) => (v?.variant_name ?? "").trim())
    .filter(Boolean);
  return values.length ? { name, values } : null;
}

async function main() {
  const archive = JSON.parse(readFileSync(IN, "utf8"));
  const dpCats: DpCat[] = archive.categories ?? [];
  let items: DpItem[] = archive.items ?? [];
  if (LIMIT > 0) items = items.slice(0, LIMIT);

  console.log(
    `Loaded ${items.length} products from ${IN}` +
      (LIMIT ? ` (LIMIT ${LIMIT})` : "") +
      `\nMode: ${APPLY ? "APPLY (writing to DB)" : "DRY-RUN (no writes)"}\n`,
  );

  const multiGroup = items.filter(
    (it) => Array.isArray(it.item_option_variants) && it.item_option_variants.length > 1,
  );
  if (multiGroup.length) {
    console.warn(
      `⚠  ${multiGroup.length} products have >1 option group; only the first is used as the SKU dimension.\n`,
    );
  }

  const sql = postgres(DB, { ssl: "require" });
  try {
    // ── existing state (idempotency + uniqueness) ──
    const existNames = new Set(
      (await sql<{ name: string }[]>`select name from products`).map((r) => r.name.trim()),
    );
    const usedSlugs = new Set((await sql<{ slug: string }[]>`select slug from products`).map((r) => r.slug));
    const usedSkus = new Set(
      (await sql<{ sku_code: string }[]>`select sku_code from skus`).map((r) => r.sku_code),
    );
    const catBySlug = new Map(
      (await sql<{ id: number; slug: string }[]>`select id, slug from categories`).map((r) => [r.slug, r.id]),
    );
    console.log(`DB currently: ${existNames.size} products, ${usedSkus.size} skus, ${catBySlug.size} categories\n`);

    // ── resolve/create categories (flat); map DotPe catId -> our id ──
    const catIdMap = new Map<number, number>();
    const catNameOf = new Map<number, string>();
    const usedCatSlugs = new Set(catBySlug.keys());
    const newCats: { name: string; slug: string }[] = [];
    const uniqueCatSlug = (name: string): string => {
      let s = slugify(name);
      const base = s;
      let i = 2;
      while (usedCatSlugs.has(s)) s = `${base}-${i++}`;
      return s;
    };
    for (const c of dpCats) {
      const name = (c.name || "").trim() || "More Items";
      catNameOf.set(c.id, name);
      const exact = slugify(name);
      if (catBySlug.has(exact)) {
        catIdMap.set(c.id, catBySlug.get(exact)!);
        continue;
      }
      const slug = uniqueCatSlug(name);
      usedCatSlugs.add(slug);
      newCats.push({ name, slug });
      if (APPLY) {
        const [row] = await sql<{ id: number }[]>`
          insert into categories (name, slug, parent_id, status)
          values (${name}, ${slug}, null, 'active')
          on conflict (slug) do update set name = excluded.name
          returning id`;
        catBySlug.set(slug, row.id);
        catIdMap.set(c.id, row.id);
      }
    }
    // fallback for items whose category isn't in the list (e.g. id 0)
    const ensureFallback = async (): Promise<number | null> => {
      if (!APPLY) return null;
      const slug = "dotpe-imported";
      if (catBySlug.has(slug)) return catBySlug.get(slug)!;
      const [row] = await sql<{ id: number }[]>`
        insert into categories (name, slug, parent_id, status)
        values ('DotPe Imported', ${slug}, null, 'active')
        on conflict (slug) do update set name = excluded.name
        returning id`;
      catBySlug.set(slug, row.id);
      return row.id;
    };

    console.log(`Categories: ${dpCats.length - newCats.length} of ${dpCats.length} map to existing, ${newCats.length} to create`);
    for (const c of newCats) console.log(`  + ${c.name}  (${c.slug})`);
    console.log("");

    const uniqueSlug = (name: string): string => {
      let s = slugify(name);
      const base = s;
      let i = 2;
      while (usedSlugs.has(s)) s = `${base}-${i++}`;
      usedSlugs.add(s);
      return s;
    };
    let skuSeq = 0;
    const uniqueSku = (): string => {
      let c = `DTP-${String(++skuSeq).padStart(5, "0")}`;
      while (usedSkus.has(c)) c = `DTP-${String(++skuSeq).padStart(5, "0")}`;
      usedSkus.add(c);
      return c;
    };

    let planned = 0,
      skipped = 0,
      inserted = 0,
      skuCount = 0,
      imgOk = 0,
      imgFail = 0,
      imgPlanned = 0;

    for (const it of items) {
      const name = (it.name ?? "").trim();
      if (!name || existNames.has(name)) {
        skipped++;
        continue;
      }
      planned++;
      const imgs = imageUrls(it);
      imgPlanned += imgs.length;
      const opts = variantOptions(it);
      const { reg, sale } = prices(it);

      if (!APPLY) {
        if (planned <= 10) {
          const cat = catNameOf.get(it.category?.id ?? -1) ?? "DotPe Imported";
          const vlabel = opts ? `  {${opts.name}: ${opts.values.join("/")}}` : "";
          console.log(
            `  • ${name.slice(0, 50).padEnd(50)} ₹${sale ?? reg}${sale ? ` (MRP ${reg})` : ""}  [${cat}]  ${imgs.length}img${vlabel}`,
          );
        }
        skuCount += opts ? opts.values.length : 1;
        continue;
      }

      // APPLY
      const slug = uniqueSlug(name);
      const catId =
        catIdMap.get(it.category?.id ?? -1) ?? (await ensureFallback());
      if (!catId) {
        console.error(`  ✗ no category for "${name.slice(0, 40)}" — skipping`);
        continue;
      }
      const stock = it.available === 0 ? 0 : 25;
      const tags = ["dotpe-import"];
      if (it.brand_name) tags.push(it.brand_name);

      // upload images first (network, outside the tx)
      const uploaded: string[] = [];
      for (let i = 0; i < imgs.length; i++) {
        const url = await copyImage(imgs[i], `imports/dotpe/${slug}-${i}`);
        if (url) {
          uploaded.push(url);
          imgOk++;
        } else imgFail++;
      }

      try {
        await sql.begin(async (tx) => {
          const [prod] = await tx<{ id: number }[]>`
            insert into products (category_id, name, slug, description, status, fits_all_vehicles, tags)
            values (${catId}, ${name}, ${slug}, ${it.description || null}, 'draft', true, ${sql.array(tags)})
            returning id`;

          if (opts) {
            await tx`insert into dimensions (product_id, name) values (${prod.id}, ${opts.name})`;
            const [dim] = await tx<{ id: number }[]>`
              select id from dimensions where product_id = ${prod.id} and name = ${opts.name} limit 1`;
            for (const val of opts.values) {
              await tx`insert into dimension_values (dimension_id, value) values (${dim.id}, ${val})`;
              await tx`
                insert into skus (product_id, sku_code, price, sale_price, dimension_values, stock)
                values (${prod.id}, ${uniqueSku()}, ${reg}, ${sale}, ${tx.json({ [opts.name]: val })}, ${stock})`;
              skuCount++;
            }
          } else {
            await tx`
              insert into skus (product_id, sku_code, price, sale_price, dimension_values, stock)
              values (${prod.id}, ${uniqueSku()}, ${reg}, ${sale}, ${tx.json({})}, ${stock})`;
            skuCount++;
          }

          for (let i = 0; i < uploaded.length; i++) {
            await tx`
              insert into product_images (product_id, url, alt, sort_order)
              values (${prod.id}, ${uploaded[i]}, ${name}, ${i})`;
          }
        });
        inserted++;
        if (inserted % 20 === 0) console.log(`  …${inserted} inserted (${imgOk} imgs, ${imgFail} img-fail)`);
      } catch (e) {
        console.error(`  ✗ insert failed for "${name.slice(0, 50)}": ${(e as Error).message}`);
      }
    }

    console.log("\n" + "─".repeat(60));
    if (APPLY) {
      console.log(
        `DONE (APPLY)  inserted=${inserted} products, ${skuCount} skus  skipped(existing/blank)=${skipped}  ` +
          `images ok=${imgOk} fail=${imgFail}\n` +
          `Categories created=${newCats.length}. New products are DRAFT + tagged 'dotpe-import'.\n` +
          "Review & publish them in the admin, then verify on the storefront.",
      );
    } else {
      console.log(
        `DRY-RUN plan:  would insert ${planned} products / ~${skuCount} skus  (skip ${skipped} existing/blank)\n` +
          `  new categories: ${newCats.length}   images to fetch: ${imgPlanned}\n` +
          "Nothing was written. Re-run with --apply to execute.",
      );
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("✗ import failed:", (e as Error).message);
  process.exit(1);
});
