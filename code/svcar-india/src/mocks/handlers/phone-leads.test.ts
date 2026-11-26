import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../node";
import { API_BASE } from "@/lib/api-config";
import { AdminPhoneLeadListSchema, PhoneLeadResponseSchema } from "@svcar/contracts";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());

function post(body: unknown) {
  return fetch(`${API_BASE}/phone-leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("phone-lead mock handlers", () => {
  it("POST /phone-leads accepts a valid number with consent", async () => {
    const res = await post({ phone: "9898989898", pagePath: "/shop", consent: true });
    expect(res.status).toBe(200);
    expect(PhoneLeadResponseSchema.parse(await res.json())).toEqual({ ok: true });
  });

  it("POST /phone-leads rejects a bad number or missing consent like the API", async () => {
    const bad = await post({ phone: "12345", consent: true });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid_phone" });
    const noConsent = await post({ phone: "9898989898" });
    expect(noConsent.status).toBe(400);
    expect(await noConsent.json()).toEqual({ error: "consent_required" });
  });

  it("GET /admin/phone-leads is gated and matches the contract", async () => {
    expect((await fetch(`${API_BASE}/admin/phone-leads`)).status).toBe(401);

    const res = await fetch(`${API_BASE}/admin/phone-leads`, { headers: { Authorization: "Bearer mock-token" } });
    expect(res.status).toBe(200);
    const list = AdminPhoneLeadListSchema.parse(await res.json());
    const posted = list.items.find((r) => r.phone === "9898989898");
    expect(posted).toMatchObject({ sources: ["popup"], popup: { count: 1, lastPagePath: "/shop" } });
    // The seeded number that both used the popup and ordered is one merged row.
    expect(list.items.find((r) => r.phone === "9810000002")?.sources).toEqual(["popup", "order"]);
    expect(list.totals.bothPhones).toBeGreaterThanOrEqual(1);
  });
});
