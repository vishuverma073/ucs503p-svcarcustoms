import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PUSH_PREFS,
  derivePushState,
  readPushPrefs,
  sameServerKey,
  stopPushOnLogout,
  urlBase64ToUint8Array,
  writePushPrefs,
  PUSH_PREFS_KEY,
  type PushStateInput,
} from "@/lib/admin-push-client";
import { MOCK_VAPID_PUBLIC_KEY } from "@/mocks/handlers/admin-push";

const READY: PushStateInput = {
  mockMode: false,
  supported: true,
  ios: false,
  standalone: false,
  permission: "default",
  serverEnabled: true,
  subscribed: false,
};

describe("push permission / subscription state machine", () => {
  it("off → only Enable is offered (permission is asked on that tap, not before)", () => {
    expect(derivePushState(READY)).toMatchObject({ state: "off", canEnable: true, canTest: false, canDisable: false });
  });

  it("subscribed + granted → on (test + turn off offered)", () => {
    expect(derivePushState({ ...READY, permission: "granted", subscribed: true })).toMatchObject({
      state: "on",
      canEnable: false,
      canTest: true,
      canDisable: true,
    });
  });

  it("granted but no subscription (e.g. it expired) → off again, so Enable re-subscribes", () => {
    expect(derivePushState({ ...READY, permission: "granted", subscribed: false }).state).toBe("off");
  });

  it("blocked permission → denied with how-to-fix text, no Enable button", () => {
    const v = derivePushState({ ...READY, permission: "denied" });
    expect(v).toMatchObject({ state: "denied", canEnable: false });
    expect(v.message).toMatch(/site settings/);
  });

  it("server without VAPID keys → server-disabled", () => {
    expect(derivePushState({ ...READY, serverEnabled: false }).state).toBe("server-disabled");
  });

  it("a network error is 'couldn't check', never 'VAPID keys not set'", () => {
    const v = derivePushState({ ...READY, serverEnabled: null, serverUnreachable: true });
    expect(v.state).toBe("server-unreachable");
    expect(v.message).not.toMatch(/VAPID/);
    expect(v.canEnable).toBe(false);
  });

  it("iPhone Safari tab (not installed) → install first, even though PushManager is missing", () => {
    const v = derivePushState({ ...READY, ios: true, standalone: false, supported: false, permission: null });
    expect(v.state).toBe("ios-install-first");
    expect(v.message).toMatch(/Add to Home Screen/);
  });

  it("iPhone home-screen app with push → normal flow", () => {
    expect(derivePushState({ ...READY, ios: true, standalone: true }).state).toBe("off");
  });

  it("browser without push → unsupported", () => {
    expect(derivePushState({ ...READY, supported: false, permission: null }).state).toBe("unsupported");
  });

  it("still loading → checking (no buttons)", () => {
    expect(derivePushState({ ...READY, serverEnabled: null })).toMatchObject({ state: "checking", canEnable: false });
    expect(derivePushState({ ...READY, subscribed: null }).state).toBe("checking");
  });

  it("mock mode wins (the MSW worker owns /admin there)", () => {
    expect(derivePushState({ ...READY, mockMode: true, permission: "granted", subscribed: true }).state).toBe("mock-mode");
  });
});

describe("VAPID key bytes", () => {
  it("decodes a base64url P-256 public key to the 65 bytes PushManager expects", () => {
    const bytes = urlBase64ToUint8Array(MOCK_VAPID_PUBLIC_KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04); // uncompressed point
  });

  it("detects a subscription made with a different server key (VAPID rotation)", () => {
    const key = urlBase64ToUint8Array(MOCK_VAPID_PUBLIC_KEY);
    expect(sameServerKey(key.slice().buffer, key)).toBe(true);
    const other = key.slice();
    other[10] = (other[10]! + 1) % 256;
    expect(sameServerKey(other.buffer, key)).toBe(false);
    expect(sameServerKey(null, key)).toBe(false);
  });
});

describe("per-device preferences", () => {
  function store() {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  }

  it("defaults to orders + leads on, not enabled", () => {
    expect(readPushPrefs(store())).toEqual(DEFAULT_PUSH_PREFS);
    expect(readPushPrefs(null)).toEqual({ orders: true, leads: true, enabled: false });
  });

  it("round-trips and survives junk", () => {
    const s = store();
    writePushPrefs(s, { orders: false, leads: true, enabled: true });
    expect(readPushPrefs(s)).toEqual({ orders: false, leads: true, enabled: true });
    s.data.set(PUSH_PREFS_KEY, "{not json");
    expect(readPushPrefs(s)).toEqual(DEFAULT_PUSH_PREFS);
  });
});

describe("logout stops push on this device", () => {
  function store() {
    const data = new Map<string, string>([[PUSH_PREFS_KEY, JSON.stringify({ orders: true, leads: false, enabled: true })]]);
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  }

  it("tells the server (with the session being signed out), then drops the browser subscription", async () => {
    const calls: string[] = [];
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/dev1", unsubscribe: vi.fn(async () => (calls.push("browser"), true)) };
    const unsubscribeOnServer = vi.fn(async () => void calls.push("server"));
    const s = store();
    await stopPushOnLogout("tok-123", { getSubscription: async () => sub, unsubscribeOnServer, storage: s });
    expect(unsubscribeOnServer).toHaveBeenCalledWith("https://fcm.googleapis.com/fcm/send/dev1", "tok-123");
    expect(calls).toEqual(["server", "browser"]);
    expect(JSON.parse(s.data.get(PUSH_PREFS_KEY)!)).toEqual({ orders: true, leads: false, enabled: false });
  });

  it("never throws: server down, browser refusing, or no service worker at all", async () => {
    const sub = { endpoint: "https://x.push.apple.com/a", unsubscribe: vi.fn(async () => { throw new Error("nope"); }) };
    await expect(
      stopPushOnLogout("t", { getSubscription: async () => sub, unsubscribeOnServer: async () => { throw new Error("offline"); }, storage: null }),
    ).resolves.toBeUndefined();
    expect(sub.unsubscribe).toHaveBeenCalled(); // still tried after the server call failed
    await expect(
      stopPushOnLogout("t", { getSubscription: async () => { throw new Error("no sw"); }, unsubscribeOnServer: vi.fn(), storage: null }),
    ).resolves.toBeUndefined();
  });

  it("nothing subscribed → no network call", async () => {
    const unsubscribeOnServer = vi.fn();
    await stopPushOnLogout("t", { getSubscription: async () => null, unsubscribeOnServer, storage: null });
    expect(unsubscribeOnServer).not.toHaveBeenCalled();
  });
});
