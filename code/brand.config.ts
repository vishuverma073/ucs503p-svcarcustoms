/**
 * ════════════════════════════════════════════════════════════════════════════
 *  BRAND CONFIG — the ONE file you edit to turn this platform into a new store
 * ════════════════════════════════════════════════════════════════════════════
 *
 * This repo is a white-label e-commerce platform. `svcar` is the first store
 * built on it; `veronica` (or anything else) is the next. Everything that makes
 * a store *that store* — its name, colours, contact details, tax and shipping
 * rules, SEO copy — lives here and nowhere else.
 *
 *  ┌─ HOW TO STAND UP A NEW BUSINESS ─────────────────────────────────────┐
 *  │                                                                      │
 *  │   1.  Edit this file. Every `« … »` marker is a value you must set.   │
 *  │   2.  npm run brand:apply      ← pushes it into both apps            │
 *  │   3.  Fill the secrets in the generated .env.brand.example files     │
 *  │   4.  Point DATABASE_URL at a fresh database, migrate, store:init    │
 *  │                                                                      │
 *  │   Full checklist with commands: NEW-BUSINESS.md                      │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 * WHAT BELONGS HERE:  identity, colours, copy, tax/shipping defaults — public
 *                     values, safe to commit, the same across every deploy.
 *
 * WHAT DOES NOT:      secrets (DATABASE_URL, JWT secrets, PayU keys, API keys)
 *                     and per-deploy wiring. Those are env vars. `brand:apply`
 *                     writes you a template listing exactly which ones you need.
 *
 * Nothing under either app's `src/` should ever contain a literal brand name,
 * domain, phone number, address or accent colour. If you find one, it is a bug.
 */

// ───────────────────────────────────────────────────────────────────────────
//  The shape every brand must fill in. Don't edit the type — edit the values
//  underneath it.
// ───────────────────────────────────────────────────────────────────────────

export type BrandConfig = {
  /** Identity — who the business is. */
  identity: {
    /**
     * Short machine slug: lowercase, no spaces. Derives the API service name,
     * the JWT issuers, the Inngest app id and the theme storage key.
     *
     * ⚠ Changing this on a LIVE store logs every admin and customer out
     *   (issued tokens carry the old issuer). Pick it once, keep it forever.
     */
    key: string;
    /** Display name. Appears in emails, SMS, page titles, JSON-LD. */
    name: string;
    /** Registered legal entity, for invoices and the terms/privacy pages. */
    legalName: string;
    /** One-line positioning statement, shown in the hero and meta description. */
    tagline: string;
    /** Founder / proprietor name for the About page. Empty string to omit. */
    founder: string;
  };

  /** Where the business lives on the internet. */
  domains: {
    /**
     * Canonical storefront origin, no trailing slash. Every canonical URL,
     * sitemap entry, OG image and order-tracking link is built from this, so
     * it must be the host that actually serves — if the apex redirects to
     * `www`, write the `www` form or every SEO URL points at a redirect.
     */
    storefront: string;
    /** Domain the transactional from-addresses are built on. */
    email: string;
  };

  /** How customers reach the business. Seeds the admin-editable settings row. */
  contact: {
    /** E.164, with country code. Used for `tel:` links and SMS replies. */
    phone: string;
    /** Support inbox. Defaults elsewhere are built from `domains.email`. */
    email: string;
    /** E.164. Usually the same as `phone`. */
    whatsapp: string;
    address: {
      line1: string;
      landmark: string;
      city: string;
      state: string;
      pincode: string;
      country: string;
    };
  };

  /**
   * Social profiles. Leave a field as an empty string and its icon simply
   * disappears from the footer — no dead links.
   */
  social: {
    instagram: string;
    facebook: string;
    youtube: string;
  };

  /**
   * Colour scheme. Type hex values here and the entire UI re-skins — this is
   * the whole design system, there is no second palette anywhere.
   */
  theme: {
    /** "dark" or "light" — what a first-time visitor sees before they choose. */
    defaultMode: "dark" | "light";

    /**
     * The accent. One colour carries the brand: buttons, prices, links, badges,
     * focus rings, the button glow. Pick something with enough contrast to sit
     * under white text.
     */
    accent: string;
    /** Accent, darkened — hover and pressed states. */
    accentDark: string;
    /** Accent, barely tinted — badge and callout backgrounds in LIGHT mode. */
    accentSoft: string;
    /** Accent, barely tinted — the same backgrounds in DARK mode. */
    accentSoftDark: string;

    /** Near-black. Headline text in light mode, and dark section backgrounds. */
    ink: string;
    /** A muted secondary, for chips and de-emphasised chrome. */
    neutral: string;

    /** Light-mode surfaces, from page background up to raised cards. */
    light: {
      surface: string;
      surfaceDim: string;
      surfaceCard: string;
      border: string;
      borderLight: string;
      textPrimary: string;
      textSecondary: string;
      textMuted: string;
    };

    /** Dark-mode equivalents of the same six surfaces. */
    dark: {
      surface: string;
      surfaceDim: string;
      surfaceCard: string;
      border: string;
      borderLight: string;
      textPrimary: string;
      textSecondary: string;
      textMuted: string;
    };

    /** Status colours. Shared by both modes; rarely worth changing. */
    success: string;
    warning: string;
    danger: string;

    /**
     * Body font. Must be a Google Font name exactly as Google spells it —
     * `brand:apply` tells you the one line to change in layout.tsx if you
     * pick something other than Inter.
     */
    fontFamily: string;
  };

  /** Money, tax and fulfilment rules. All amounts in whole rupees. */
  commerce: {
    /** ISO 4217. */
    currency: string;
    /** Symbol shown in the UI. */
    currencySymbol: string;
    /** BCP 47 tag, for number and date formatting. */
    locale: string;
    /** GST percentage applied at checkout. Auto parts 28, most goods 18. */
    gstRate: number;
    /** Order subtotal above which shipping is free. */
    shippingFreeAbove: number;
    /** Flat shipping fee below that threshold. */
    shippingFlatFee: number;
    /**
     * Two letters prefixed to every public order number.
     *
     * ⚠ Changing this on a LIVE store renumbers existing orders — the number
     *   is derived from the order's UUID, not stored. Pick it once.
     */
    orderPrefix: string;
    /**
     * Sender prefix on transactional SMS. Keep it short: it eats into the
     * 160-character segment and DLT-approved templates match on the text.
     */
    smsPrefix: string;
  };

  /** Default metadata. Per-page titles override these. */
  seo: {
    /** The `<title>` of the home page and the OG/Twitter card title. */
    title: string;
    /** ~155 characters. Shown in search results and link previews. */
    description: string;
    /** Search keywords. Include the brand name itself. */
    keywords: string[];
  };
};

// ───────────────────────────────────────────────────────────────────────────
//  ⬇ THE ACTIVE BRAND. This is the part you edit. ⬇
//
//  Currently: SV Car Customs. To start a new business, replace every value
//  below (the `« … »` markers show what each one wants) and run
//  `npm run brand:apply`.
// ───────────────────────────────────────────────────────────────────────────

export const brandConfig: BrandConfig = {
  identity: {
    key: "svcar", //                        « lowercase slug, e.g. "veronica" »
    name: "SV Car Customs", //              « display name »
    legalName: "SV Car Customs", //         « registered entity »
    tagline: "Best car accessories delivered to your doorstep",
    founder: "Shivam Verma", //             « "" to omit the founder story »
  },

  domains: {
    storefront: "https://www.svcarcustoms.in", // « no trailing slash »
    email: "svcarcustoms.in", //                  « bare domain, no @ »
  },

  contact: {
    phone: "+919205005425", //              « E.164 »
    email: "support@svcarcustoms.in",
    whatsapp: "+919205005425",
    address: {
      line1: "Shop no.2, Ground Floor, Plot no. 734-A",
      landmark: "Opposite CISF Camp",
      city: "Delhi",
      state: "Delhi",
      pincode: "110061",
      country: "India",
    },
  },

  social: {
    instagram: "https://www.instagram.com/svcarcustoms/",
    facebook: "", //                        « "" hides the icon »
    youtube: "",
  },

  // ── Colour scheme ────────────────────────────────────────────────────────
  // Dark, sporty: charcoal base, performance-red accent.
  theme: {
    defaultMode: "dark",

    accent: "#E11D2A", //                   « the brand colour »
    accentDark: "#B31620", //               « ~15% darker, for hover »
    accentSoft: "#FDE8EA", //               « ~95% lighter, light-mode tints »
    accentSoftDark: "#2A1214", //           « very dark tint, dark-mode tints »

    ink: "#0C0C0D",
    neutral: "#3F3F46",

    light: {
      surface: "#FCFCFC",
      surfaceDim: "#F3F3F3",
      surfaceCard: "#FFFFFF",
      border: "#E6E6E6",
      borderLight: "#F1F1F1",
      textPrimary: "#0C0C0D",
      textSecondary: "#52525B",
      textMuted: "#A1A1AA",
    },

    dark: {
      surface: "#0B0B0C",
      surfaceDim: "#18181B",
      surfaceCard: "#1B1B1F",
      border: "#2A2A2F",
      borderLight: "#232327",
      textPrimary: "#FAFAFA",
      textSecondary: "#B4B4BC",
      textMuted: "#8A8A93",
    },

    success: "#16A34A",
    warning: "#EAB308",
    danger: "#DC2626",

    fontFamily: "Inter",
  },

  commerce: {
    currency: "INR",
    currencySymbol: "₹",
    locale: "en-IN",
    gstRate: 28, //                         « 28 for auto parts, 18 for most »
    shippingFreeAbove: 5000,
    shippingFlatFee: 200,
    orderPrefix: "SV", //                   « exactly 2 uppercase letters »
    smsPrefix: "Svcar", //                  « short — it costs SMS characters »
  },

  seo: {
    // ≤60 / ≤155 characters. "SV Car" is how most searches for the store are
    // typed. Only claims /shipping makes: free delivery on every order, COD
    // with a 15% advance — change this line if the admin delivery fee changes.
    title: "SV Car Customs | Car Accessories, Body Kits, Steering Wheels",
    description:
      "SV Car Customs (SV Car) – car accessories, body kits, spoilers & carbon fibre steering wheels. Free delivery across India, COD with 15% advance.",
    keywords: [
      "car body kits",
      "car spoilers",
      "ambient lights",
      "car diffusers",
      "exhaust tips",
      "car accessories India",
      "carbon fibre steering wheel",
      "SV Car Customs",
      "SV Car",
    ],
  },
};

export default brandConfig;
