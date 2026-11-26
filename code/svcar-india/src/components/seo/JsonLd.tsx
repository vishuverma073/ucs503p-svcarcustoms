/**
 * Server-rendered schema.org JSON-LD block. Kept as a Server Component so the
 * markup lands in the initial HTML (crawlable / rich-result eligible even with
 * JS off). Pass any plain schema.org object.
 */
/**
 * Escape the three sequences that let JSON break out of a <script> block.
 * JSON.stringify does NOT escape `<`, `>` or `&`, so a product/category name
 * like `</script><img onerror=...>` would otherwise inject live DOM (stored XSS).
 */
function safeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />
  );
}
