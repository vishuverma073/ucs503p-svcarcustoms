import { describe, expect, it } from "vitest";

process.env.JWT_ADMIN_SECRET = "test-admin-secret-at-least-32-chars-long!!";
// The admin middleware caches the user lookup per id unless LOG_LEVEL is debug —
// without this the non-admin case below poisons the cache for the rest.
process.env.LOG_LEVEL = "debug";

import { createApp } from "../src/app.js";
import { signAdminAccess } from "../src/lib/jwt.js";
import type { DbClient } from "../src/db/client.js";

const ADMIN_ID = "fb354b9c-6c05-4379-8f2c-4c59962d4761";
const SUB_ID = "9f1c2f7e-2b44-4a1e-9b0a-1d3c5e7a9b21";

/** `deleted` controls what the DELETE ... RETURNING gives back: a row, or none. */
function mockDb(opts: { admin?: boolean; deleted?: unknown[] } = {}): DbClient {
  const adminRow =
    opts.admin === false ? null : { id: ADMIN_ID, email: "a@b.com", name: "A", isAdmin: true };
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (adminRow ? [adminRow] : []) }) }),
    }),
    delete: () => ({
      where: () => ({ returning: async () => opts.deleted ?? [] }),
    }),
  } as unknown as DbClient;
}

const token = () => signAdminAccess({ sub: ADMIN_ID });

describe("DELETE /admin/subscribers/:id", () => {
  it("401 without a token", async () => {
    const res = await createApp({ db: mockDb() }).request(`/admin/subscribers/${SUB_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("403 for a non-admin token", async () => {
    const res = await createApp({ db: mockDb({ admin: false }) }).request(
      `/admin/subscribers/${SUB_ID}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } },
    );
    expect(res.status).toBe(403);
  });

  it("400 when the id isn't a uuid", async () => {
    const res = await createApp({ db: mockDb({ admin: true }) }).request(
      "/admin/subscribers/not-a-uuid",
      { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } },
    );
    expect(res.status).toBe(400);
  });

  it("404 when no row matched", async () => {
    const res = await createApp({ db: mockDb({ admin: true, deleted: [] }) }).request(
      `/admin/subscribers/${SUB_ID}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } },
    );
    expect(res.status).toBe(404);
  });

  it("204 once the row is gone", async () => {
    const res = await createApp({
      db: mockDb({ admin: true, deleted: [{ id: SUB_ID }] }),
    }).request(`/admin/subscribers/${SUB_ID}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(204);
  });
});

describe("DELETE /admin/whatsapp-leads/:id", () => {
  it("401 without a token", async () => {
    const res = await createApp({ db: mockDb() }).request(`/admin/whatsapp-leads/${SUB_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("400 when the id isn't a uuid", async () => {
    const res = await createApp({ db: mockDb({ admin: true }) }).request(
      "/admin/whatsapp-leads/nope",
      { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } },
    );
    expect(res.status).toBe(400);
  });

  it("404 when no row matched", async () => {
    const res = await createApp({ db: mockDb({ admin: true, deleted: [] }) }).request(
      `/admin/whatsapp-leads/${SUB_ID}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${await token()}` } },
    );
    expect(res.status).toBe(404);
  });

  it("204 once the row is gone", async () => {
    const res = await createApp({
      db: mockDb({ admin: true, deleted: [{ id: SUB_ID }] }),
    }).request(`/admin/whatsapp-leads/${SUB_ID}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(204);
  });
});
