/**
 * Business identity — the one file a fork edits.
 *
 * This repo is a template: to stand up a new business you copy it, change the
 * values here (or set the matching env vars), point DATABASE_URL at a fresh
 * database, and run `pnpm store:init`. Nothing else in `src/` should ever
 * mention a brand name, domain, or phone number.
 *
 * Three layers, in precedence order:
 *   1. env var        — differs per deploy (staging vs prod), never committed
 *   2. this file      — identity, committed, edited once per fork
 *   3. settings table — admin-editable at runtime, no deploy needed
 *                       (see routes/settings.ts + scripts/init-store.ts)
 *
 * Every field is a getter, not a frozen constant, because env vars are read at
 * call time — tests mutate process.env between cases, and `--env-file` loading
 * order must not matter.
 */
import type { StoreAddress } from "../db/schema.js";
import { brandDefaults } from "./brand.defaults.js";

function env(key: string, fallback: string): string {
  const raw = process.env[key]?.trim();
  return raw ? raw : fallback;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export const brand = {
  /**
   * Short machine slug. Derives the service name, JWT issuers, and the Inngest
   * app id — so it must stay stable for a given deploy. Changing it invalidates
   * every issued admin/customer token (all sessions log out).
   */
  get key(): string {
    return env("BRAND_KEY", brandDefaults.key);
  },

  /** Display name used in emails, SMS, and schema.org JSON-LD. */
  get name(): string {
    return env("BRAND_NAME", brandDefaults.name);
  },

  /** Logger `service` field, Inngest app id, and default customer JWT issuer. */
  get serviceName(): string {
    return env("BRAND_SERVICE_NAME", `${brand.key}-api`);
  },

  /** Admin-token issuer. Separate from the customer issuer by design. */
  get adminIssuer(): string {
    return `${brand.key}-admin`;
  },

  /** Customer access/refresh token issuer. */
  get customerIssuer(): string {
    return env("JWT_ISSUER", brand.serviceName);
  },

  /** Customer-facing storefront origin, no trailing slash. Used for order links. */
  get storefrontUrl(): string {
    return stripTrailingSlash(env("STOREFRONT_URL", brandDefaults.storefrontUrl));
  },

  /** Domain the transactional from-addresses are built on. */
  get emailDomain(): string {
    return env("BRAND_EMAIL_DOMAIN", brandDefaults.emailDomain);
  },

  /**
   * From-address for OTP login mail. RESEND_FROM_EMAIL overrides it — that env
   * var predates this file and is still honoured for both mail types.
   */
  get loginEmailFrom(): string {
    return env("RESEND_FROM_EMAIL", `login@${brand.emailDomain}`);
  },

  /** From-address for order-confirmation mail. See `loginEmailFrom`. */
  get orderEmailFrom(): string {
    return env("RESEND_FROM_EMAIL", `orders@${brand.emailDomain}`);
  },

  /**
   * Sender prefix on transactional SMS bodies. Keep it short — it eats into the
   * 160-character segment, and DLT-approved templates are matched on the text.
   */
  get smsPrefix(): string {
    return env("BRAND_SMS_PREFIX", brandDefaults.smsPrefix);
  },

  /**
   * Two-letter prefix on every public order number.
   *
   * Order numbers are derived from the order's UUID rather than stored, so
   * changing this renumbers every existing order. Set it once, at fork time.
   */
  get orderPrefix(): string {
    return env("BRAND_ORDER_PREFIX", brandDefaults.orderPrefix);
  },

  /** Accent colour for email CTA buttons and the OTP code. */
  get accentColor(): string {
    return env("BRAND_ACCENT_COLOR", brandDefaults.accentColor);
  },

  /**
   * Seed values for the singleton `settings` row, written once by
   * `scripts/init-store.ts`. After that the admin UI owns these — editing them
   * here has no effect on an already-initialised database.
   */
  store: {
    get name(): string {
      return env("BRAND_STORE_NAME", brand.name);
    },
    get supportPhone(): string {
      return env("BRAND_SUPPORT_PHONE", brandDefaults.store.supportPhone);
    },
    get supportEmail(): string {
      return env("BRAND_SUPPORT_EMAIL", `support@${brand.emailDomain}`);
    },
    get whatsappNumber(): string {
      return env("BRAND_WHATSAPP_NUMBER", brand.store.supportPhone);
    },
    /** GST percentage applied at checkout. */
    get gstRate(): number {
      return num("BRAND_GST_RATE", brandDefaults.store.gstRate);
    },
    /** Order subtotal above which shipping is free. */
    get shippingFreeAbove(): number {
      return num("BRAND_SHIPPING_FREE_ABOVE", brandDefaults.store.shippingFreeAbove);
    },
    /** Flat shipping fee below the free-shipping threshold. */
    get shippingFlatFee(): number {
      return num("BRAND_SHIPPING_FLAT_FEE", brandDefaults.store.shippingFlatFee);
    },
    get address(): StoreAddress {
      return {
        line1: env("BRAND_ADDRESS_LINE1", brandDefaults.store.address.line1),
        landmark: env("BRAND_ADDRESS_LANDMARK", brandDefaults.store.address.landmark),
        city: env("BRAND_ADDRESS_CITY", brandDefaults.store.address.city),
        state: env("BRAND_ADDRESS_STATE", brandDefaults.store.address.state),
        pincode: env("BRAND_ADDRESS_PINCODE", brandDefaults.store.address.pincode),
      };
    },
  },
} as const;
