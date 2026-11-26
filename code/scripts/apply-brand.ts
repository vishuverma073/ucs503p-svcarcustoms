/**
 * Push `brand.config.ts` into both apps.
 *
 *   npm run brand:apply     write the generated files
 *   npm run brand:check     verify they match the config (exit 1 if stale) — CI
 *
 * The root config sits outside both build contexts (Fly builds `svcar-api/`,
 * Vercel builds `svcar-india/`), so neither app can import it at build time.
 * Instead this generates committed artifacts inside each app:
 *
 *   svcar-api/apps/api/src/config/brand.defaults.ts   defaults behind brand.ts
 *   svcar-india/src/lib/brand.ts                      the storefront's identity
 *   svcar-india/src/app/globals.css                   theme tokens, spliced in
 *   svcar-api/apps/api/.env.brand.example             secrets you must supply
 *   svcar-india/.env.brand.example                    same, storefront side
 *
 * Every generated file carries a "do not edit" header. Edit brand.config.ts.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import brand from "../brand.config.ts";
import type { BrandConfig } from "../brand.config.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHECK = process.argv.includes("--check");

/** Header for line-commented languages: pass "//" or "#". */
const BANNER = (c: string) =>
  [
    c + " GENERATED FILE — do not edit.",
    c + " Written by `npm run brand:apply` from brand.config.ts at the repo root.",
    c + " Change a value there and re-run; edits here are overwritten.",
  ].join("\n");

/** CSS block comments cannot nest, so CSS gets its own single-comment banner. */
const CSS_BANNER = [
  "  /* GENERATED — do not edit. Written by `npm run brand:apply` from",
  "     brand.config.ts at the repo root. Change a value there and re-run. */",
].join("\n");

// ── validation ────────────────────────────────────────────────────────────
// Cheap guards for the mistakes that actually happen when someone forks this.

function validate(b: BrandConfig): string[] {
  const errors: string[] = [];
  const hex = /^#[0-9A-Fa-f]{6}$/;

  if (!/^[a-z][a-z0-9-]*$/.test(b.identity.key))
    errors.push('identity.key "' + b.identity.key + '" must be lowercase letters, digits and dashes');
  if (b.domains.storefront.endsWith("/"))
    errors.push("domains.storefront must not end with a slash");
  if (!/^https?:\/\//.test(b.domains.storefront))
    errors.push("domains.storefront must be an absolute http(s) URL");
  if (b.domains.email.includes("@") || b.domains.email.includes("/"))
    errors.push('domains.email must be a bare domain, e.g. "example.com"');
  if (!/^\+[1-9]\d{7,14}$/.test(b.contact.phone))
    errors.push('contact.phone must be E.164, e.g. "+919205005425"');
  if (!/^\+[1-9]\d{7,14}$/.test(b.contact.whatsapp))
    errors.push("contact.whatsapp must be E.164");
  if (!/^[A-Z]{2}$/.test(b.commerce.orderPrefix))
    errors.push("commerce.orderPrefix must be exactly two uppercase letters");
  if (b.commerce.gstRate < 0 || b.commerce.gstRate > 100)
    errors.push("commerce.gstRate must be a percentage between 0 and 100");
  if (b.commerce.smsPrefix.length > 12)
    errors.push("commerce.smsPrefix is " + b.commerce.smsPrefix.length + " chars — keep it under 12");
  if (b.seo.description.length > 165)
    errors.push(
      "seo.description is " + b.seo.description.length + " chars — search results cut off past ~155",
    );

  const colors: Array<[string, string]> = [
    ["theme.accent", b.theme.accent],
    ["theme.accentDark", b.theme.accentDark],
    ["theme.accentSoft", b.theme.accentSoft],
    ["theme.accentSoftDark", b.theme.accentSoftDark],
    ["theme.ink", b.theme.ink],
    ["theme.neutral", b.theme.neutral],
    ["theme.success", b.theme.success],
    ["theme.warning", b.theme.warning],
    ["theme.danger", b.theme.danger],
  ];
  for (const mode of ["light", "dark"] as const)
    for (const [k, v] of Object.entries(b.theme[mode])) colors.push(["theme." + mode + "." + k, v]);
  for (const [path, value] of colors)
    if (!hex.test(value))
      errors.push(path + ' "' + value + '" must be a 6-digit hex colour like "#E11D2A"');

  const unfilled = JSON.stringify(b).match(/«[^»]*»/g);
  if (unfilled) errors.push("unfilled placeholder(s) left in values: " + unfilled.join(", "));

  return errors;
}

// ── helpers ───────────────────────────────────────────────────────────────

/** "#E11D2A" -> "225, 29, 42", for rgba() shadows tinted with the accent. */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255);
}

const q = (s: string) => JSON.stringify(s);

// ── generated: API defaults ───────────────────────────────────────────────

function apiDefaults(b: BrandConfig): string {
  return `${BANNER("//")}
//
// The committed fallbacks behind config/brand.ts. An env var still wins over
// anything here — see the precedence note in that file.

export const brandDefaults = {
  key: ${q(b.identity.key)},
  name: ${q(b.identity.name)},
  legalName: ${q(b.identity.legalName)},
  storefrontUrl: ${q(b.domains.storefront)},
  emailDomain: ${q(b.domains.email)},
  smsPrefix: ${q(b.commerce.smsPrefix)},
  accentColor: ${q(b.theme.accent)},
  /** Two-letter prefix on every public order number. */
  orderPrefix: ${q(b.commerce.orderPrefix)},
  store: {
    supportPhone: ${q(b.contact.phone)},
    supportEmail: ${q(b.contact.email)},
    whatsappNumber: ${q(b.contact.whatsapp)},
    gstRate: ${b.commerce.gstRate},
    shippingFreeAbove: ${b.commerce.shippingFreeAbove},
    shippingFlatFee: ${b.commerce.shippingFlatFee},
    address: {
      line1: ${q(b.contact.address.line1)},
      landmark: ${q(b.contact.address.landmark)},
      city: ${q(b.contact.address.city)},
      state: ${q(b.contact.address.state)},
      pincode: ${q(b.contact.address.pincode)},
    },
  },
} as const;
`;
}

// ── generated: storefront brand module ────────────────────────────────────

function storefrontBrand(b: BrandConfig): string {
  const a = b.contact.address;
  const encoded = encodeURIComponent(
    a.line1 + ", " + a.landmark + ", " + a.city + ", " + a.pincode + ", " + a.country,
  );

  const socials = (["instagram", "facebook", "youtube"] as const)
    .filter((k) => b.social[k].trim() !== "")
    .map((k) => {
      const label = k === "youtube" ? "YouTube" : k[0].toUpperCase() + k.slice(1);
      return "    { label: " + q(label) + ", href: " + q(b.social[k]) + " },";
    });

  return `${BANNER("//")}
//
// The storefront's identity. Import from here instead of typing a brand name,
// domain, phone number or address into a component.

export const BRAND = {
  key: ${q(b.identity.key)},
  name: ${q(b.identity.name)},
  legalName: ${q(b.identity.legalName)},
  tagline: ${q(b.identity.tagline)},
  founder: ${q(b.identity.founder)},

  /** Canonical origin, no trailing slash. */
  siteUrl: ${q(b.domains.storefront)},
  /** Bare domain the transactional from-addresses are built on. */
  emailDomain: ${q(b.domains.email)},

  contact: {
    phone: ${q(b.contact.phone)},
    email: ${q(b.contact.email)},
    /** Digits only — wa.me links reject the leading "+". */
    whatsapp: ${q(b.contact.whatsapp.replace(/[^0-9]/g, ""))},
    address: {
      line1: ${q(a.line1)},
      landmark: ${q(a.landmark)},
      city: ${q(a.city)},
      state: ${q(a.state)},
      pincode: ${q(a.pincode)},
      country: ${q(a.country)},
    },
    /** Pre-formatted for the footer and the contact page. */
    addressLines: [
      ${q(a.line1)},
      ${q(a.landmark + ", " + a.city + ", " + a.pincode)},
    ],
  },

  /** Only the profiles that were filled in — no dead links in the footer. */
  social: [
${socials.join("\n")}
  ],

  maps: {
    /** Opens the place in the Google Maps app or site. No API key needed. */
    openUrl: ${q("https://www.google.com/maps/search/?api=1&query=" + encoded)},
    /** For an iframe. Needs CSP frame-src to allow google.com. */
    embedUrl: ${q("https://www.google.com/maps?q=" + encoded + "&hl=en&z=15&output=embed")},
  },

  commerce: {
    currency: ${q(b.commerce.currency)},
    currencySymbol: ${q(b.commerce.currencySymbol)},
    locale: ${q(b.commerce.locale)},
    gstRate: ${b.commerce.gstRate},
    shippingFreeAbove: ${b.commerce.shippingFreeAbove},
    shippingFlatFee: ${b.commerce.shippingFlatFee},
    orderPrefix: ${q(b.commerce.orderPrefix)},
  },

  seo: {
    title: ${q(b.seo.title)},
    description: ${q(b.seo.description)},
    keywords: [
${b.seo.keywords.map((k) => "      " + q(k) + ",").join("\n")}
    ],
  },

  theme: {
    /** What a first-time visitor sees before they pick a mode. */
    defaultMode: ${q(b.theme.defaultMode)},
    /** localStorage key holding the visitor's choice. */
    storageKey: ${q(b.identity.key + "-theme")},
    /** The accent, for the few places CSS variables cannot reach (OG images). */
    accent: ${q(b.theme.accent)},
    fontFamily: ${q(b.theme.fontFamily)},
  },
} as const;

export type Brand = typeof BRAND;
`;
}

// ── generated: theme tokens spliced into globals.css ──────────────────────

function themeTokens(b: BrandConfig): string {
  const t = b.theme;
  return `${CSS_BANNER}

  /* Accent. The historical brand-orange token names are kept because ~50
     components reference them (text-brand-orange and friends); read them as
     "brand accent" — the VALUE is whatever theme.accent is set to. */
  --color-brand-orange: ${t.accent};
  --color-brand-orange-dark: ${t.accentDark};
  --color-brand-orange-light: ${t.accentSoft};
  --color-brand-black: ${t.ink};
  --color-brand-blue: ${t.neutral};

  /* Light-mode surfaces. The .dark block below overrides these. */
  --color-surface: ${t.light.surface};
  --color-surface-dim: ${t.light.surfaceDim};
  --color-surface-card: ${t.light.surfaceCard};
  --color-border: ${t.light.border};
  --color-border-light: ${t.light.borderLight};
  --color-text-primary: ${t.light.textPrimary};
  --color-text-secondary: ${t.light.textSecondary};
  --color-text-muted: ${t.light.textMuted};

  /* Status. --color-whatsapp is WhatsApp's own green, not ours. */
  --color-success: ${t.success};
  --color-warning: ${t.warning};
  --color-danger: ${t.danger};
  --color-whatsapp: #25D366;

  /* --font-brand is set by next/font in layout.tsx. */
  --font-sans: var(--font-brand), ${q(t.fontFamily)}, ui-sans-serif, system-ui, -apple-system, sans-serif;

  /* Shadows. The last two are tinted with the accent. */
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.03);
  --shadow-card-hover: 0 8px 25px rgba(0, 0, 0, 0.08), 0 4px 10px rgba(0, 0, 0, 0.04);
  --shadow-elevated: 0 20px 60px rgba(0, 0, 0, 0.1), 0 8px 20px rgba(0, 0, 0, 0.06);
  --shadow-btn: 0 2px 8px rgba(${rgb(t.accent)}, 0.25);
  --shadow-glow-orange: 0 0 20px rgba(${rgb(t.accent)}, 0.15);`;
}

function darkTokens(b: BrandConfig): string {
  const d = b.theme.dark;
  return `${CSS_BANNER}
  --color-surface: ${d.surface};
  --color-surface-dim: ${d.surfaceDim};
  --color-surface-card: ${d.surfaceCard};
  --color-border: ${d.border};
  --color-border-light: ${d.borderLight};
  --color-text-primary: ${d.textPrimary};
  --color-text-secondary: ${d.textSecondary};
  --color-text-muted: ${d.textMuted};
  /* Accent tint that reads on a dark surface. */
  --color-brand-orange-light: ${b.theme.accentSoftDark};`;
}

/** Replace the text between the brand:<id>:start and :end marker comments. */
function splice(css: string, id: string, body: string, file: string): string {
  const start = "/* brand:" + id + ":start */";
  const end = "/* brand:" + id + ":end */";
  const from = css.indexOf(start);
  const to = css.indexOf(end);
  if (from === -1 || to === -1 || to < from) {
    throw new Error(
      file + " is missing the " + start + " … " + end + " markers.\n" +
        "  Add them around the block this script owns, then re-run.",
    );
  }
  // `to` points at the marker itself, so its own indentation falls inside the
  // replaced span — re-emit it from the opening marker's indentation.
  const indent = css.slice(css.lastIndexOf("\n", from) + 1, from);
  return css.slice(0, from + start.length) + "\n" + body + "\n" + indent + css.slice(to);
}

// ── generated: env templates ──────────────────────────────────────────────

function apiEnvExample(b: BrandConfig): string {
  return `${BANNER("#")}
#
# Secrets and per-deploy wiring for the ${b.identity.name} API. Identity lives in
# brand.config.ts and is already compiled in — nothing brand-related belongs here
# unless you want one deploy to differ.
#
# Copy to svcar-api/apps/api/.env and fill in. Never commit the filled copy.

# ─── REQUIRED — the API will not boot without these ─────────────────────────
DATABASE_URL=postgres://user:password@host:5432/${b.identity.key}
# Three separate secrets, 32+ bytes each. Generate: openssl rand -hex 32
JWT_ADMIN_SECRET=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

# ─── REQUIRED TO TAKE MONEY — stub mode until both are set ──────────────────
# From the PayU dashboard. Keep PAYU_MODE=test until you are ready to go live.
PAYU_MERCHANT_KEY=
PAYU_MERCHANT_SALT=
PAYU_MODE=test

# ─── STRONGLY RECOMMENDED — each feature is skipped while unset ─────────────
# Product image uploads (the upload endpoint 503s without both):
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# Order + OTP email. Without a key the OTP is printed to the API terminal.
RESEND_API_KEY=
RESEND_FROM_EMAIL=orders@${b.domains.email}
# Order + OTP SMS (MSG91). Sender id must be exactly 6 characters.
MSG91_AUTH_KEY=
MSG91_SENDER_ID=
MSG91_TEMPLATE_ID=
MSG91_ORDER_TEMPLATE_ID=

# ─── OPTIONAL ───────────────────────────────────────────────────────────────
# Distributed OTP rate limiting; falls back to in-process when unset.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# Background jobs, error tracking, log shipping, alerts.
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
SENTRY_DSN=
AXIOM_DATASET=
AXIOM_TOKEN=
SLACK_WEBHOOK_URL=
# Browser origins allowed to call this API, comma-separated. localhost is always
# allowed; add the storefront's deployed origin.
CORS_ORIGINS=${b.domains.storefront}

# ─── BRAND OVERRIDES (rare) ─────────────────────────────────────────────────
# Everything below already defaults to brand.config.ts. Set one only to make a
# single deploy differ — a staging API pointing at a staging storefront, say.
# STOREFRONT_URL=${b.domains.storefront}
# BRAND_NAME=${b.identity.name}
# BRAND_SUPPORT_PHONE=${b.contact.phone}
# BRAND_SUPPORT_EMAIL=${b.contact.email}
# BRAND_GST_RATE=${b.commerce.gstRate}
# BRAND_SHIPPING_FREE_ABOVE=${b.commerce.shippingFreeAbove}
# BRAND_SHIPPING_FLAT_FEE=${b.commerce.shippingFlatFee}
`;
}

function webEnvExample(b: BrandConfig): string {
  return `${BANNER("#")}
#
# Per-deploy wiring for the ${b.identity.name} storefront. Identity, colours and
# SEO copy come from brand.config.ts and are compiled in — none of that is here.
#
# Local dev: copy to svcar-india/.env.local.
# Vercel:    paste into Project → Settings → Environment Variables.

# ─── PICK ONE MODE ──────────────────────────────────────────────────────────
# A · Mock preview — no backend or database. Click through the whole store.
NEXT_PUBLIC_USE_MOCKS=true
NEXT_PUBLIC_MOCK_PAYMENTS=true

# B · Real backend — production. Turn mocks OFF; never ship MSW to production.
# NEXT_PUBLIC_USE_MOCKS=false
# NEXT_PUBLIC_MOCK_PAYMENTS=false
# NEXT_PUBLIC_API_URL=https://api.${b.domains.email}

# ─── OPTIONAL — analytics and pixels, all inert until set ───────────────────
# NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
# NEXT_PUBLIC_GOOGLE_ADS_ID=AW-XXXXXXXXX
# NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL=
# NEXT_PUBLIC_META_PIXEL_ID=
# NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
# NEXT_PUBLIC_SENTRY_DSN=

# ─── OPTIONAL — social profile overrides ────────────────────────────────────
# Defaults come from brand.config.ts; set these only to differ per deploy.
# NEXT_PUBLIC_SOCIAL_INSTAGRAM=${b.social.instagram}
# NEXT_PUBLIC_SOCIAL_FACEBOOK=${b.social.facebook}
# NEXT_PUBLIC_SOCIAL_YOUTUBE=${b.social.youtube}

# ─── OPTIONAL — LAN testing from a phone ────────────────────────────────────
# NEXT_PUBLIC_USE_API_PROXY=true
# API_PROXY_TARGET=http://127.0.0.1:8787
`;
}

// ── run ───────────────────────────────────────────────────────────────────

const problems = validate(brand);
if (problems.length > 0) {
  console.error("✗ brand.config.ts has " + problems.length + " problem(s):\n");
  for (const p of problems) console.error("  · " + p);
  console.error("\nFix them and re-run.");
  process.exit(1);
}

const cssPath = join(ROOT, "svcar-india/src/app/globals.css");
if (!existsSync(cssPath)) throw new Error("missing " + cssPath);
let css = readFileSync(cssPath, "utf8");
css = splice(css, "tokens", themeTokens(brand), "globals.css");
css = splice(css, "dark", darkTokens(brand), "globals.css");

const outputs: Array<[string, string]> = [
  ["svcar-api/apps/api/src/config/brand.defaults.ts", apiDefaults(brand)],
  ["svcar-india/src/lib/brand.ts", storefrontBrand(brand)],
  ["svcar-india/src/app/globals.css", css],
  ["svcar-api/apps/api/.env.brand.example", apiEnvExample(brand)],
  ["svcar-india/.env.brand.example", webEnvExample(brand)],
];

const stale: string[] = [];
for (const [rel, content] of outputs) {
  const path = join(ROOT, rel);
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current === content) continue;
  stale.push(rel);
  if (!CHECK) writeFileSync(path, content);
}

if (CHECK) {
  if (stale.length === 0) {
    console.log("✓ generated files match brand.config.ts (" + brand.identity.name + ")");
    process.exit(0);
  }
  console.error("✗ " + stale.length + " generated file(s) are stale — run `npm run brand:apply`:\n");
  for (const f of stale) console.error("  · " + f);
  process.exit(1);
}

console.log('✓ applied brand "' + brand.identity.name + '" (' + brand.identity.key + ")\n");
if (stale.length === 0) console.log("  everything was already up to date.");
else for (const f of stale) console.log("  wrote  " + f);

console.log(
  [
    "",
    "  accent " + brand.theme.accent + " · " + brand.theme.defaultMode +
      " by default · GST " + brand.commerce.gstRate + "%",
    "  orders numbered " + brand.commerce.orderPrefix + "XXXXXXXXXX · free shipping above " +
      brand.commerce.currencySymbol + brand.commerce.shippingFreeAbove,
    "",
    "  Next: fill the secrets in the two .env.brand.example files — see NEW-BUSINESS.md.",
  ].join("\n"),
);

if (brand.theme.fontFamily !== "Inter") {
  console.log(
    '\n  ⚠ theme.fontFamily is "' + brand.theme.fontFamily + '" — change the next/font import\n' +
      "    in svcar-india/src/app/layout.tsx to match. That one line is not generated.",
  );
}
