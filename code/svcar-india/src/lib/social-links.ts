import { BRAND } from "@/lib/brand";

/**
 * Storefront social profile URLs.
 *
 * Defaults come from `social` in brand.config.ts; a NEXT_PUBLIC_SOCIAL_* env
 * var overrides one for a single deploy. A profile left blank in both places
 * has no icon rendered — avoids dead `#` links in the footer.
 */
export type SocialLink = {
  label: "Instagram" | "Facebook" | "YouTube";
  href: string;
};

function readUrl(key: string): string | undefined {
  const raw = process.env[key]?.trim();
  if (!raw || raw === "#") return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** The brand-config default for one platform, if it was filled in. */
function fromBrand(label: SocialLink["label"]): string | undefined {
  return BRAND.social.find((s) => s.label === label)?.href;
}

/** Social links with valid http(s) URLs only. */
export function getSocialLinks(): SocialLink[] {
  const sources: Array<[SocialLink["label"], string]> = [
    ["Instagram", "NEXT_PUBLIC_SOCIAL_INSTAGRAM"],
    ["Facebook", "NEXT_PUBLIC_SOCIAL_FACEBOOK"],
    ["YouTube", "NEXT_PUBLIC_SOCIAL_YOUTUBE"],
  ];
  const links: SocialLink[] = [];
  for (const [label, envKey] of sources) {
    const href = readUrl(envKey) ?? fromBrand(label);
    if (href) links.push({ label, href });
  }
  return links;
}
