import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * SEO-tool and AI-training crawlers. They bring no shoppers, and every page
 * they walk is a server render that counts against the hosting CPU quota (the
 * site was paused for exactly that in Oct 2026). Search engines and the
 * WhatsApp/Facebook link-preview bots are not on this list.
 */
const BLOCKED_BOTS = [
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "Bytespider",
  "PetalBot",
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Amazonbot",
  "meta-externalagent",
  "DataForSeoBot",
  "BLEXBot",
  "serpstatbot",
];

/** Allow public pages; keep account/checkout/admin/API surfaces out of the index. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/account", "/orders", "/cart", "/checkout", "/login", "/api/"],
      },
      { userAgent: BLOCKED_BOTS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
