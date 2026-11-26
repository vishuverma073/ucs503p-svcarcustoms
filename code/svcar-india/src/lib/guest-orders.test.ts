import { beforeEach, describe, expect, it } from "vitest";
import {
  getGuestOrderAccess,
  getGuestOrderToken,
  loadGuestDetails,
  saveGuestDetails,
  saveGuestOrderToken,
  saveTrackedContact,
} from "@/lib/guest-orders";

/** Minimal in-memory localStorage (the test environment has none). */
function installStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  });
  return data;
}

describe("guest order tokens", () => {
  beforeEach(() => {
    installStorage();
  });

  it("stores and returns the token per order number", () => {
    saveGuestOrderToken("SV1", "token-one");
    saveGuestOrderToken("SV2", "token-two");
    expect(getGuestOrderToken("SV1")).toBe("token-one");
    expect(getGuestOrderToken("SV2")).toBe("token-two");
    expect(getGuestOrderToken("SV3")).toBeNull();
  });

  it("keeps only the 20 most recent orders", () => {
    for (let i = 1; i <= 25; i++) saveGuestOrderToken(`SV${i}`, `t${i}`);
    expect(getGuestOrderToken("SV5")).toBeNull();
    expect(getGuestOrderToken("SV6")).toBe("t6");
    expect(getGuestOrderToken("SV25")).toBe("t25");
  });

  it("survives corrupt or blocked storage", () => {
    const data = installStorage();
    data.set("svcar-guest-orders", "{not json");
    expect(getGuestOrderToken("SV1")).toBeNull();
    saveGuestOrderToken("SV1", "t1");
    expect(getGuestOrderToken("SV1")).toBe("t1");

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    expect(() => saveGuestOrderToken("SV2", "t2")).not.toThrow();
    expect(getGuestOrderToken("SV2")).toBeNull();
    expect(loadGuestDetails()).toEqual({});
  });

  it("remembers checkout details", () => {
    const details = {
      email: "a@b.co",
      fullName: "Asha",
      phone: "9876543210",
      line1: "12 Mall Road",
      line2: "",
      city: "Patiala",
      state: "Punjab",
      pincode: "147001",
      landmark: "",
    };
    saveGuestDetails(details);
    expect(loadGuestDetails()).toEqual(details);
  });
});

describe("guest order access", () => {
  beforeEach(() => {
    installStorage();
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    });
  });

  it("prefers the saved token, else the contact entered on Track order", () => {
    saveGuestOrderToken("SV1", "token-one");
    saveTrackedContact("SV1", "a@b.com");
    saveTrackedContact("SV2", "9876543210");
    expect(getGuestOrderAccess("SV1")).toEqual({ token: "token-one" });
    expect(getGuestOrderAccess("SV2")).toEqual({ contact: "9876543210" });
    expect(getGuestOrderAccess("SV3")).toBeNull();
  });
});
