/**
 * The brand config is what makes this repo forkable, so the contract it has to
 * hold is: with no BRAND_* env set, every value is byte-identical to what was
 * hardcoded before the refactor. If these fallbacks drift, the live SV Car
 * Customs deploy silently changes its emails, SMS, and token issuers.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { brand } from "../src/config/brand.js";

const BRAND_KEYS = [
  "BRAND_KEY",
  "BRAND_NAME",
  "BRAND_SERVICE_NAME",
  "BRAND_EMAIL_DOMAIN",
  "BRAND_SMS_PREFIX",
  "BRAND_ACCENT_COLOR",
  "BRAND_STORE_NAME",
  "BRAND_SUPPORT_PHONE",
  "BRAND_SUPPORT_EMAIL",
  "BRAND_WHATSAPP_NUMBER",
  "BRAND_GST_RATE",
  "BRAND_SHIPPING_FREE_ABOVE",
  "BRAND_SHIPPING_FLAT_FEE",
  "STOREFRONT_URL",
  "JWT_ISSUER",
  "RESEND_FROM_EMAIL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of BRAND_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("brand fallbacks (must match the pre-refactor hardcoded values)", () => {
  it("keeps the service identity stable", () => {
    expect(brand.key).toBe("svcar");
    expect(brand.name).toBe("SV Car Customs");
    expect(brand.serviceName).toBe("svcar-api");
    expect(brand.adminIssuer).toBe("svcar-admin");
    expect(brand.customerIssuer).toBe("svcar-api");
  });

  it("keeps the customer-facing URLs and addresses stable", () => {
    expect(brand.storefrontUrl).toBe("https://www.svcarcustoms.in");
    expect(brand.loginEmailFrom).toBe("login@svcarcustoms.in");
    expect(brand.orderEmailFrom).toBe("orders@svcarcustoms.in");
    expect(brand.smsPrefix).toBe("Svcar");
    // The email accent now tracks theme.accent in brand.config.ts — one accent
    // per brand, so transactional mail matches the storefront instead of
    // keeping the pre-rebrand orange.
    expect(brand.accentColor).toBe("#E11D2A");
    expect(brand.orderPrefix).toBe("SV");
  });

  it("keeps the settings seed values stable", () => {
    expect(brand.store.name).toBe("SV Car Customs");
    expect(brand.store.supportPhone).toBe("+919205005425");
    expect(brand.store.supportEmail).toBe("support@svcarcustoms.in");
    expect(brand.store.whatsappNumber).toBe("+919205005425");
    expect(brand.store.gstRate).toBe(28);
    expect(brand.store.shippingFreeAbove).toBe(5000);
    expect(brand.store.shippingFlatFee).toBe(200);
    expect(brand.store.address.pincode).toBe("110061");
  });
});

describe("brand overrides", () => {
  it("re-reads env on every access, not once at import", () => {
    process.env.BRAND_NAME = "Veronica";
    expect(brand.name).toBe("Veronica");
    delete process.env.BRAND_NAME;
    expect(brand.name).toBe("SV Car Customs");
  });

  it("derives service name and both issuers from BRAND_KEY", () => {
    process.env.BRAND_KEY = "veronica";
    expect(brand.serviceName).toBe("veronica-api");
    expect(brand.adminIssuer).toBe("veronica-admin");
    expect(brand.customerIssuer).toBe("veronica-api");
  });

  it("builds from-addresses off BRAND_EMAIL_DOMAIN", () => {
    process.env.BRAND_EMAIL_DOMAIN = "veronica.in";
    expect(brand.loginEmailFrom).toBe("login@veronica.in");
    expect(brand.orderEmailFrom).toBe("orders@veronica.in");
    expect(brand.store.supportEmail).toBe("support@veronica.in");
  });

  it("still lets RESEND_FROM_EMAIL win over the derived addresses", () => {
    process.env.RESEND_FROM_EMAIL = "hello@veronica.in";
    expect(brand.loginEmailFrom).toBe("hello@veronica.in");
    expect(brand.orderEmailFrom).toBe("hello@veronica.in");
  });

  it("strips trailing slashes from STOREFRONT_URL", () => {
    process.env.STOREFRONT_URL = "https://veronica.in///";
    expect(brand.storefrontUrl).toBe("https://veronica.in");
  });

  it("ignores a non-numeric numeric override rather than producing NaN", () => {
    process.env.BRAND_GST_RATE = "not-a-number";
    expect(brand.store.gstRate).toBe(28);
  });
});
