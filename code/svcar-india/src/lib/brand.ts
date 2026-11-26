// GENERATED FILE — do not edit.
// Written by `npm run brand:apply` from brand.config.ts at the repo root.
// Change a value there and re-run; edits here are overwritten.
//
// The storefront's identity. Import from here instead of typing a brand name,
// domain, phone number or address into a component.

export const BRAND = {
  key: "svcar",
  name: "SV Car Customs",
  legalName: "SV Car Customs",
  tagline: "Best car accessories delivered to your doorstep",
  founder: "Shivam Verma",

  /** Canonical origin, no trailing slash. */
  siteUrl: "https://www.svcarcustoms.in",
  /** Bare domain the transactional from-addresses are built on. */
  emailDomain: "svcarcustoms.in",

  contact: {
    phone: "+919205005425",
    email: "support@svcarcustoms.in",
    /** Digits only — wa.me links reject the leading "+". */
    whatsapp: "919205005425",
    address: {
      line1: "Shop no.2, Ground Floor, Plot no. 734-A",
      landmark: "Opposite CISF Camp",
      city: "Delhi",
      state: "Delhi",
      pincode: "110061",
      country: "India",
    },
    /** Pre-formatted for the footer and the contact page. */
    addressLines: [
      "Shop no.2, Ground Floor, Plot no. 734-A",
      "Opposite CISF Camp, Delhi, 110061",
    ],
  },

  /** Only the profiles that were filled in — no dead links in the footer. */
  social: [
    { label: "Instagram", href: "https://www.instagram.com/svcarcustoms/" },
  ],

  maps: {
    /** Opens the place in the Google Maps app or site. No API key needed. */
    openUrl: "https://www.google.com/maps/search/?api=1&query=Shop%20no.2%2C%20Ground%20Floor%2C%20Plot%20no.%20734-A%2C%20Opposite%20CISF%20Camp%2C%20Delhi%2C%20110061%2C%20India",
    /** For an iframe. Needs CSP frame-src to allow google.com. */
    embedUrl: "https://www.google.com/maps?q=Shop%20no.2%2C%20Ground%20Floor%2C%20Plot%20no.%20734-A%2C%20Opposite%20CISF%20Camp%2C%20Delhi%2C%20110061%2C%20India&hl=en&z=15&output=embed",
  },

  commerce: {
    currency: "INR",
    currencySymbol: "₹",
    locale: "en-IN",
    gstRate: 28,
    shippingFreeAbove: 5000,
    shippingFlatFee: 200,
    orderPrefix: "SV",
  },

  seo: {
    title: "SV Car Customs | Car Accessories, Body Kits, Steering Wheels",
    description: "SV Car Customs (SV Car) – car accessories, body kits, spoilers & carbon fibre steering wheels. Free delivery across India, COD with 15% advance.",
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

  theme: {
    /** What a first-time visitor sees before they pick a mode. */
    defaultMode: "dark",
    /** localStorage key holding the visitor's choice. */
    storageKey: "svcar-theme",
    /** The accent, for the few places CSS variables cannot reach (OG images). */
    accent: "#E11D2A",
    fontFamily: "Inter",
  },
} as const;

export type Brand = typeof BRAND;
