import { backend } from "@/lib/backend";
import { buildMerchantFeed } from "@/lib/merchant-feed";

/**
 * Google Merchant Center product feed — see lib/merchant-feed.ts for what goes
 * in it and why. Merchant Center fetches this URL on a schedule (daily) and
 * lists the catalogue in the Shopping tab for free.
 *
 * Every product the API returns is `status: active` with at least one image
 * and one priced SKU; the builder then leaves out duplicates and titles that
 * would read as a counterfeit claim (lib/feed-brands.ts).
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  // Shipping comes from the live admin settings — what checkout charges.
  const [settings, categories] = await Promise.all([
    backend.getPublicSettings().catch(() => null),
    backend.getAllCategories().catch(() => []),
  ]);
  let feed: Awaited<ReturnType<typeof backend.getProductFeed>>;
  try {
    feed = await backend.getProductFeed();
  } catch {
    // Serving a malformed or empty feed would have Merchant Center delist the
    // catalogue. A 503 tells it to retry instead.
    return new Response("feed unavailable", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  const { xml } = buildMerchantFeed({
    items: feed.items,
    currency: feed.currency,
    settings,
    categories,
  });

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
