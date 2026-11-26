/**
 * One-shot import of the scraped Zelix catalogue into products/skus/product_images.
 * - status = draft (owner reviews & publishes)
 * - images copied Zelix CDN -> Supabase Storage (product-images/imports/zelix/*)
 * - idempotent: products whose exact name already exists are skipped
 *
 * Run:  npx tsx --env-file=.env scripts/import-zelix.ts
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const JSON_PATH =
  "/private/tmp/claude-501/-Users-vishuverma-Downloads-SVCARCUSTOMS/bc0cbb10-7e01-42c9-8a11-31fb92458d1d/scratchpad/zelix_base.json";

type Item = {
  name: string;
  price: number;
  sale: number | null;
  image: string;
  categoryId: number;
  subcat: string;
  ext: string;
};

const DB = process.env.DATABASE_URL ?? "";
const SB = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!DB) throw new Error("DATABASE_URL missing");
if (!SB || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");

const CT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const sql = postgres(DB, { ssl: "require" });

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 70)
    .replace(/^-+|-+$/g, "") || "product";
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

/** Download from Zelix, upload to Supabase, return public URL (or null on failure). */
async function copyImage(srcUrl: string, key: string, ext: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const dl = await fetchWithTimeout(srcUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!dl.ok) throw new Error(`download ${dl.status}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      if (buf.length < 100) throw new Error("empty image");
      const up = await fetchWithTimeout(`${SB}/storage/v1/object/product-images/${key}`, {
        method: "POST",
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          "Content-Type": CT[ext] ?? "image/jpeg",
          "x-upsert": "true",
        },
        body: buf,
      });
      if (!up.ok) throw new Error(`upload ${up.status} ${await up.text().catch(() => "")}`.slice(0, 120));
      return `${SB}/storage/v1/object/public/product-images/${key}`;
    } catch (e) {
      if (attempt === 1) {
        console.warn(`  ! image failed (${(e as Error).message}) for ${key}`);
        return null;
      }
    }
  }
  return null;
}

async function main() {
  let items: Item[] = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const limit = Number(process.env.ZLX_LIMIT ?? 0);
  if (limit > 0) items = items.slice(0, limit);
  console.log(`Loaded ${items.length} products from JSON${limit ? ` (LIMIT ${limit})` : ""}`);

  // Existing state for idempotency + uniqueness
  const existNames = new Set(
    (await sql<{ name: string }[]>`select name from products`).map((r) => r.name.trim()),
  );
  const usedSlugs = new Set(
    (await sql<{ slug: string }[]>`select slug from products`).map((r) => r.slug),
  );
  const usedSkus = new Set(
    (await sql<{ sku_code: string }[]>`select sku_code from skus`).map((r) => r.sku_code),
  );
  console.log(`DB has ${existNames.size} products, ${usedSkus.size} skus already`);

  function uniqueSlug(name: string): string {
    let s = slugify(name);
    const base = s;
    let i = 2;
    while (usedSlugs.has(s)) s = `${base}-${i++}`;
    usedSlugs.add(s);
    return s;
  }
  function uniqueSku(idx: number): string {
    let c = `ZLX-${String(idx).padStart(4, "0")}`;
    let i = 0;
    while (usedSkus.has(c)) c = `ZLX-${String(idx).padStart(4, "0")}-${++i}`;
    usedSkus.add(c);
    return c;
  }

  let inserted = 0,
    skipped = 0,
    imgOk = 0,
    imgFail = 0;

  const CONC = 5;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      const it = items[idx];
      if (existNames.has(it.name.trim())) {
        skipped++;
        continue;
      }
      const slug = uniqueSlug(it.name);
      const sku = uniqueSku(idx + 1);
      const key = `imports/zelix/${slug}.${it.ext}`;
      const imgUrl = it.image ? await copyImage(it.image, key, it.ext) : null;
      if (imgUrl) imgOk++;
      else if (it.image) imgFail++;

      try {
        await sql.begin(async (tx) => {
          const [prod] = await tx<{ id: number }[]>`
            insert into products (category_id, name, slug, description, status, fits_all_vehicles)
            values (${it.categoryId}, ${it.name}, ${slug}, ${it.name}, 'draft', true)
            returning id`;
          await tx`
            insert into skus (product_id, sku_code, price, sale_price, dimension_values, stock)
            values (${prod.id}, ${sku}, ${it.price}, ${it.sale}, ${tx.json({})}, 25)`;
          if (imgUrl) {
            await tx`
              insert into product_images (product_id, url, alt, sort_order)
              values (${prod.id}, ${imgUrl}, ${it.name}, 0)`;
          }
        });
        inserted++;
        if (inserted % 25 === 0) console.log(`  …${inserted} inserted (${imgOk} imgs, ${imgFail} img-fail)`);
      } catch (e) {
        console.error(`  ✗ insert failed for "${it.name.slice(0, 50)}": ${(e as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));

  console.log(
    `\nDONE  inserted=${inserted}  skipped(existing)=${skipped}  images ok=${imgOk} fail=${imgFail}`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
