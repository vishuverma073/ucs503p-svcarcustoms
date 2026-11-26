import { describe, expect, it } from "vitest";
import { createAdminSessionStorage, isTokenExpired, jwtExpiry, type StorageLike } from "@/lib/admin-session-storage";

/** In-memory Storage. A "new browser context" keeps localStorage but gets a fresh sessionStorage. */
function mem(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const KEY = "svcar-admin-auth";
const SESSION = JSON.stringify({ state: { token: "t-123", admin: { email: "a@b.c" } }, version: 0 });

describe("keep me signed in — storage choice", () => {
  it("unticked (default): the session goes to sessionStorage only — gone in a new tab/app launch", () => {
    const local = mem();
    const session = mem();
    const s = createAdminSessionStorage(() => local, () => session);
    s.setRemember(false);
    s.storage.setItem(KEY, SESSION);
    expect(session.data.get(KEY)).toBe(SESSION);
    expect(local.data.has(KEY)).toBe(false);

    // Reopen: same localStorage, brand-new sessionStorage.
    const reopened = createAdminSessionStorage(() => local, () => mem());
    expect(reopened.storage.getItem(KEY)).toBeNull();
  });

  it("ticked: the same token goes to localStorage only — still signed in after reopening", () => {
    const local = mem();
    const session = mem();
    const s = createAdminSessionStorage(() => local, () => session);
    s.setRemember(true);
    s.storage.setItem(KEY, SESSION);
    expect(local.data.get(KEY)).toBe(SESSION);
    expect(session.data.has(KEY)).toBe(false);
    expect(s.isRemembered()).toBe(true);

    const reopened = createAdminSessionStorage(() => local, () => mem());
    expect(reopened.storage.getItem(KEY)).toBe(SESSION);
    // Later writes (e.g. profile refresh) keep going to localStorage.
    expect(reopened.isRemembered()).toBe(true);
    reopened.storage.setItem(KEY, "updated");
    expect(local.data.get(KEY)).toBe("updated");
  });

  it("signing in again without the tick moves the session out of localStorage", () => {
    const local = mem();
    const session = mem();
    const s = createAdminSessionStorage(() => local, () => session);
    s.setRemember(true);
    s.storage.setItem(KEY, SESSION);
    s.setRemember(false);
    s.storage.setItem(KEY, SESSION);
    expect(local.data.has(KEY)).toBe(false);
    expect(session.data.get(KEY)).toBe(SESSION);
  });

  it("logout clears BOTH stores", () => {
    const local = mem();
    const session = mem();
    local.data.set(KEY, SESSION);
    session.data.set(KEY, SESSION);
    const s = createAdminSessionStorage(() => local, () => session);
    s.clearAll(KEY);
    expect(local.data.has(KEY)).toBe(false);
    expect(session.data.has(KEY)).toBe(false);
    expect(s.isRemembered()).toBe(false);
  });

  it("blocked storage (private mode) never throws", () => {
    const boom: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    const s = createAdminSessionStorage(() => boom, () => boom);
    expect(s.storage.getItem(KEY)).toBeNull();
    expect(() => s.storage.setItem(KEY, SESSION)).not.toThrow();
    expect(() => s.clearAll(KEY)).not.toThrow();
  });
});

describe("token expiry (unchanged 8h server TTL)", () => {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = (exp: number) => `${b64({ alg: "HS256" })}.${b64({ sub: "x", exp })}.sig`;

  it("reads exp and treats a passed exp as expired", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(jwtExpiry(jwt(1_800_000_000))).toBe(1_800_000_000);
    expect(isTokenExpired(jwt(now / 1000 - 1), now)).toBe(true);
    expect(isTokenExpired(jwt(now / 1000 + 8 * 3600), now)).toBe(false);
  });

  it("opaque tokens (mock mode) are left to the server", () => {
    expect(jwtExpiry("mock-token")).toBeNull();
    expect(isTokenExpired("mock-token")).toBe(false);
  });
});
