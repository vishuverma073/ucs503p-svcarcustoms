/**
 * Import the full Zelix Shopify catalogue (products.json) into products/skus/
 * dimensions/product_images. Rich data: real descriptions, per-variant prices,
 * one primary image (resized, copied to Supabase). status=draft. Idempotent by slug.
 *
 * Run:  npx tsx --env-file=.env scripts/import-shopify.ts
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const JSON_PATH =
  "/private/tmp/claude-501/-Users-vishuverma-Downloads-SVCARCUSTOMS/bc0cbb10-7e01-42c9-8a11-31fb92458d1d/scratchpad/zelix_shopify.json";
const SB = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
if (!SB || !KEY) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY missing");
const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
const LIMIT = Number(process.env.SHOP_LIMIT ?? 0);

// sub-category slug -> id
const SUB: Record<string, number> = {
  "full-body-kits": 8, "front-splitters": 9, "rear-diffusers": 10,
  "lip-spoilers": 11, "gt-wings": 12, "ambient-lights": 13, "tail-lights": 15,
  "headlights-drls": 14, "exhaust-systems": 16, "exhaust-tips": 17,
  "paddle-shifters": 18, "custom-interiors": 19, "interior-trims": 20,
  "custom-exteriors": 21, "custom-kits": 22, "speakers": 23, "subwoofers": 24,
};

const RULES: [RegExp, string][] = [
  [/exhaust\s*tip|\btips?\b.*exhaust|exhaust.*\btips?\b/i, "exhaust-tips"],
  [/exhaust|muffler|down\s?pipe|cat[-\s]?back|silencer|akrapovic|\bborla\b|\bremus\b|valvetronic/i, "exhaust-systems"],
  [/sub\s?woofer|\bwoofer\b/i, "subwoofers"],
  [/speaker|tweeter|amplifier|\bjbl\b|\bdsp\b|sound\s?system|\baudio\b/i, "speakers"],
  [/ambient/i, "ambient-lights"],
  [/tail\s?light|tail\s?lamp|rear\s?light/i, "tail-lights"],
  [/head\s?light|head\s?lamp|\bdrl\b|projector|fog\s?light|fog\s?lamp|\bhid\b|\bled\b|\blamp\b|\blight\b/i, "headlights-drls"],
  [/paddle/i, "paddle-shifters"],
  [/\bseat\b|recaro|\bbride\b|bucket\s?seat|racing\s?seat|steering|\bmomo\b|\bsparco\b/i, "custom-interiors"],
  [/\btrim\b|dashboard|\bdash\b|arm\s?rest|\bpedal|gear\s?(knob|lever|shift)|floor\s?mat|cabin|door\s?sill/i, "interior-trims"],
  [/interior/i, "custom-interiors"],
  [/gt[-\s]?wing|\bwing\b/i, "gt-wings"],
  [/spoiler/i, "lip-spoilers"],
  [/full\s?body\s?kit|complete\s?body\s?kit|conversion\s?kit|wide\s?body/i, "full-body-kits"],
  [/splitter|front\s?lip|chin\s?lip/i, "front-splitters"],
  [/diffuser/i, "rear-diffusers"],
  [/side\s?skirt|\bskirt\b/i, "full-body-kits"],
  [/body\s?kit/i, "full-body-kits"],
  [/bumper|fender|\bhood\b|bonnet|canard|apron/i, "full-body-kits"],
  [/emblem|badge|\blogo\b|monogram|lettering|sticker|decal|grille|\bgrill\b|mirror|wheel|\brim\b|hub\s?cap|\bcaps?\b|wrap|\bcover\b/i, "custom-exteriors"],
  [/exterior|\bkit\b/i, "custom-kits"],
];
function classify(title: string, body: string): number {
  const hay = `${title} ${body}`.slice(0, 400);
  for (const [rx, slug] of RULES) if (rx.test(hay)) return SUB[slug];
  return SUB["custom-exteriors"];
}

function htmlToText(html: string): string {
  return (html || "")
    .replace(/<\/(p|div|h\d|ul)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n")
    .trim().slice(0, 4000);
}

function num(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

async function fetchTimeout(url: string, opts: RequestInit = {}, ms = 25000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(t); }
}

async function copyPrimary(src: string, slug: string): Promise<string | null> {
  const url = src.includes("?") ? `${src}&width=1000` : `${src}?width=1000`;
  for (let a = 0; a < 2; a++) {
    try {
      const dl = await fetchTimeout(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!dl.ok) throw new Error(`dl ${dl.status}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      if (buf.length < 100) throw new Error("empty");
      const key = `imports/shopify/${slug}.jpg`;
      const up = await fetchTimeout(`${SB}/storage/v1/object/product-images/${key}`, {
        method: "POST",
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "image/jpeg", "x-upsert": "true" },
        body: buf,
      });
      if (!up.ok) throw new Error(`up ${up.status}`);
      return `${SB}/storage/v1/object/public/product-images/${key}`;
    } catch (e) {
      if (a === 1) { console.warn(`  ! img ${slug}: ${(e as Error).message}`); return null; }
    }
  }
  return null;
}

type Variant = { title: string; option1: string | null; option2: string | null; option3: string | null; price: string; compare_at_price: string | null; available: boolean };
type Opt = { name: string; values: string[] };
type Product = { title: string; handle: string; body_html: string; vendor: string; options: Opt[]; variants: Variant[]; images: { src: string; position: number }[] };

async function main() {
  let items: Product[] = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  if (LIMIT > 0) items = items.slice(0, LIMIT);
  console.log(`Loaded ${items.length} products${LIMIT ? ` (LIMIT ${LIMIT})` : ""}`);

  const usedSlugs = new Set((await sql<{ slug: string }[]>`select slug from products`).map((r) => r.slug));
  const usedSku = new Set((await sql<{ sku_code: string }[]>`select sku_code from skus`).map((r) => r.sku_code));
  const existHandles = new Set(usedSlugs);
  let skuSeq = 1;
  const uSlug = (h: string) => { let s = h.slice(0, 70) || "product"; const b = s; let i = 2; while (usedSlugs.has(s)) s = `${b}-${i++}`; usedSlugs.add(s); return s; };
  const uSku = () => { let c = `SHP-${String(skuSeq++).padStart(5, "0")}`; while (usedSku.has(c)) c = `SHP-${String(skuSeq++).padStart(5, "0")}`; usedSku.add(c); return c; };

  let inserted = 0, skipped = 0, imgOk = 0, imgFail = 0, skuCount = 0;
  const CONC = 6;
  let cur = 0;
  async function worker() {
    while (cur < items.length) {
      const p = items[cur++];
      if (existHandles.has(p.handle)) { skipped++; continue; }
      const slug = uSlug(p.handle);
      const catId = classify(p.title, p.body_html || "");
      const desc = htmlToText(p.body_html || "");
      const realOpts = (p.options || []).filter((o) => o.name && o.name.toLowerCase() !== "title");
      const primary = p.images?.[0]?.src;
      const imgUrl = primary ? await copyPrimary(primary, slug) : null;
      if (imgUrl) imgOk++; else if (primary) imgFail++;

      // pre-allocate sku codes (outside tx so the shared counter stays consistent)
      const skuCodes = p.variants.map(() => uSku());
      try {
        await sql.begin(async (tx) => {
          const [prod] = await tx<{ id: number }[]>`
            insert into products (category_id, name, slug, description, status, fits_all_vehicles, tags)
            values (${catId}, ${p.title}, ${slug}, ${desc || null}, 'draft', true, ${sql.array(p.vendor ? [p.vendor] : [])})
            returning id`;
          // dimensions from real options
          for (let d = 0; d < realOpts.length; d++) {
            const o = realOpts[d];
            const [dim] = await tx<{ id: number }[]>`
              insert into dimensions (product_id, name, sort_order) values (${prod.id}, ${o.name}, ${d}) returning id`;
            await tx`insert into dimension_values ${sql(o.values.map((v, i) => ({ dimension_id: dim.id, value: v, label: v, sort_order: i })))}`;
          }
          // skus from variants
          for (let vi = 0; vi < p.variants.length; vi++) {
            const v = p.variants[vi];
            const reg = num(v.compare_at_price) ?? num(v.price) ?? 0;
            let sale = num(v.compare_at_price) ? num(v.price) : null;
            if (sale != null && sale >= reg) sale = null;
            const dv: Record<string, string> = {};
            realOpts.forEach((o, oi) => {
              const val = [v.option1, v.option2, v.option3][oi];
              if (val) dv[o.name] = val;
            });
            await tx`
              insert into skus (product_id, sku_code, price, sale_price, dimension_values, stock)
              values (${prod.id}, ${skuCodes[vi]}, ${reg}, ${sale}, ${tx.json(dv)}, ${v.available ? 25 : 0})`;
          }
          if (imgUrl) await tx`insert into product_images (product_id, url, alt, sort_order) values (${prod.id}, ${imgUrl}, ${p.title}, 0)`;
        });
        inserted++; skuCount += p.variants.length;
        if (inserted % 50 === 0) console.log(`  …${inserted} products, ${skuCount} skus (${imgOk} imgs, ${imgFail} fail)`);
      } catch (e) {
        console.error(`  ✗ ${p.handle}: ${(e as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  console.log(`\nDONE  products=${inserted}  skus=${skuCount}  skipped=${skipped}  images ok=${imgOk} fail=${imgFail}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
