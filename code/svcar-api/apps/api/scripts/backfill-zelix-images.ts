/** Backfill images for ZLX products that have none (large-PNG uploads that 413'd). */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const JSON_PATH =
  "/private/tmp/claude-501/-Users-vishuverma-Downloads-SVCARCUSTOMS/bc0cbb10-7e01-42c9-8a11-31fb92458d1d/scratchpad/zelix_base.json";
const SB = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const sql = postgres(process.env.DATABASE_URL!, { ssl: "require" });

function slugify(n: string) {
  return (n.normalize("NFKD").replace(/[^\x00-\x7F]/g, "").replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70).replace(/^-+|-+$/g, "")) || "product";
}

async function main() {
  const base: { name: string; image: string; ext: string }[] = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const byName = new Map(base.map((b) => [b.name.trim(), b]));

  const missing = await sql<{ id: number; name: string }[]>`
    select p.id, p.name from products p
    join skus s on s.product_id = p.id
    left join product_images i on i.product_id = p.id
    where s.sku_code like 'ZLX-%' and i.id is null order by p.id`;
  console.log(`${missing.length} products missing images`);

  let ok = 0, fail = 0;
  for (const m of missing) {
    const src = byName.get(m.name.trim());
    if (!src?.image) { console.warn(`  no source url for #${m.id}`); fail++; continue; }
    try {
      const dl = await fetch(src.image, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!dl.ok) throw new Error(`download ${dl.status}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      const key = `imports/zelix/${slugify(m.name)}-full.${src.ext}`;
      const up = await fetch(`${SB}/storage/v1/object/product-images/${key}`, {
        method: "POST",
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": CT[src.ext] ?? "image/jpeg", "x-upsert": "true" },
        body: buf,
      });
      if (!up.ok) throw new Error(`upload ${up.status} ${(await up.text()).slice(0, 100)}`);
      const url = `${SB}/storage/v1/object/public/product-images/${key}`;
      await sql`insert into product_images (product_id, url, alt, sort_order) values (${m.id}, ${url}, ${m.name}, 0)`;
      console.log(`  ✓ #${m.id} ${(buf.length / 1e6).toFixed(1)}MB`);
      ok++;
    } catch (e) {
      console.warn(`  ✗ #${m.id}: ${(e as Error).message}`);
      fail++;
    }
  }
  console.log(`\nbackfill done: ok=${ok} fail=${fail}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
