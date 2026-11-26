import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { phoneLeads } from "../src/db/schema.js";
import type { DbClient } from "../src/db/client.js";

interface Inserted {
  table: unknown;
  values: any;
}

/**
 * Fake db: `recent` is what the "same number in the last 24h" lookup finds;
 * every insert is recorded so tests can see exactly what was written.
 */
function makeDb(opts: { recent?: unknown[] } = {}, inserted: Inserted[] = [], lookups: unknown[] = []): DbClient {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: unknown) => ({
          limit: async () => {
            lookups.push({ table, cond });
            return opts.recent ?? [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      // The route reads the new row's id back (for the admin alert's tag).
      values: (values: unknown) => {
        inserted.push({ table, values });
        return Object.assign(Promise.resolve(), { returning: async () => [{ id: inserted.length }] });
      },
    }),
  } as unknown as DbClient;
}

const VALID = { phone: "9876543210", pagePath: "/product/led-tail-lamp", visitorId: "vid-123", consent: true };

function post(app: ReturnType<typeof createApp>, body: unknown, headers: Record<string, string> = {}) {
  return app.request("/phone-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /phone-leads", () => {
  it("needs no sign-in: stores the number with its page and visitor, answers {ok:true}", async () => {
    const inserted: Inserted[] = [];
    const lookups: unknown[] = [];
    const res = await post(createApp({ db: makeDb({}, inserted, lookups) }), VALID);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(lookups).toHaveLength(1); // checked for a recent duplicate first
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.table).toBe(phoneLeads);
    expect(inserted[0]!.values).toEqual({
      phone: "9876543210",
      source: "popup",
      pagePath: "/product/led-tail-lamp",
      visitorId: "vid-123",
    });
  });

  it("accepts +91 / 0 / spaces / dashes and stores the bare 10 digits", async () => {
    for (const typed of ["+91 98765 43210", "+919876543210", "919876543210", "098765 43210", "98765-43210", " 98765 43210 "]) {
      const inserted: Inserted[] = [];
      const res = await post(createApp({ db: makeDb({}, inserted) }), { ...VALID, phone: typed });
      expect(res.status, typed).toBe(200);
      expect(inserted[0]!.values.phone, typed).toBe("9876543210");
    }
  });

  it("400 invalid_phone for a number that isn't a 10-digit Indian mobile", async () => {
    const inserted: Inserted[] = [];
    const app = createApp({ db: makeDb({}, inserted) });
    for (const phone of ["12345", "5876543210", "98765432", "987654321012", "abcdefghij", "", "+1 415 555 0100"]) {
      const res = await post(app, { ...VALID, phone });
      expect(res.status, phone).toBe(400);
      expect(await res.json(), phone).toEqual({ error: "invalid_phone" });
    }
    expect(inserted).toHaveLength(0);
  });

  it("400 consent_required unless consent is literally true", async () => {
    const inserted: Inserted[] = [];
    const app = createApp({ db: makeDb({}, inserted) });
    const { consent: _omit, ...noConsent } = VALID;
    for (const body of [noConsent, { ...VALID, consent: false }, { ...VALID, consent: "true" }, { ...VALID, consent: 1 }]) {
      const res = await post(app, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "consent_required" });
    }
    expect(inserted).toHaveLength(0);
  });

  it("400 for a body that isn't JSON", async () => {
    const res = await post(createApp({ db: makeDb() }), "not json");
    expect(res.status).toBe(400);
  });

  it("same number within 24h: same {ok:true} answer, nothing inserted", async () => {
    const inserted: Inserted[] = [];
    const res = await post(createApp({ db: makeDb({ recent: [{ id: 41 }] }, inserted) }), {
      ...VALID,
      phone: "+91 98765 43210",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(inserted).toHaveLength(0);
  });

  it("drops a page path that isn't a site path, and empty ids", async () => {
    const inserted: Inserted[] = [];
    const res = await post(createApp({ db: makeDb({}, inserted) }), {
      phone: "9876543210",
      pagePath: "https://evil.example/x",
      visitorId: "",
      consent: true,
    });
    expect(res.status).toBe(200);
    expect(inserted[0]!.values).toMatchObject({ pagePath: null, visitorId: null });
  });

  it("lets a failed write surface as a 500 instead of pretending it was saved", async () => {
    const db = {
      ...makeDb(),
      insert: () => ({
        values: () => ({
          returning: async () => {
            throw new Error('relation "phone_leads" does not exist');
          },
        }),
      }),
    } as unknown as DbClient;
    const res = await post(createApp({ db }), VALID);
    expect(res.status).toBe(500);
  });
});

describe("POST /phone-leads rate limit", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env.NODE_ENV = env.NODE_ENV;
  });

  it("allows 5 per IP per 10 minutes, then 429 with Retry-After", async () => {
    // The limiter is a no-op under NODE_ENV=test; switch it on with the
    // in-memory store (no Upstash) for this one test.
    process.env.NODE_ENV = "development";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const app = createApp({ db: makeDb() });
    const ip = { "x-real-ip": "203.0.113.77" };
    for (let i = 0; i < 5; i++) {
      expect((await post(app, VALID, ip)).status).toBe(200);
    }
    const blocked = await post(app, VALID, ip);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);

    // A different visitor still gets through.
    expect((await post(app, VALID, { "x-real-ip": "203.0.113.78" })).status).toBe(200);
  });
});
