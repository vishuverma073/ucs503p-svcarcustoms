import { describe, expect, it } from "vitest";
import { onBfcacheRestore } from "@/lib/payu";

function pageshow(persisted: boolean): Event {
  return Object.assign(new Event("pageshow"), { persisted });
}

describe("onBfcacheRestore", () => {
  it("fires only when the page comes back from the back/forward cache", () => {
    const target = new EventTarget();
    let calls = 0;
    const off = onBfcacheRestore(() => calls++, target);

    target.dispatchEvent(pageshow(false)); // a normal load
    expect(calls).toBe(0);
    target.dispatchEvent(pageshow(true)); // Back from PayU, restored from bfcache
    expect(calls).toBe(1);

    off();
    target.dispatchEvent(pageshow(true));
    expect(calls).toBe(1);
  });
});
