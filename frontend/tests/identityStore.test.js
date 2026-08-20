/**
 * Guards for the device identity store (epic 015, ADR 021).
 *
 * The two functions look like a straightforward getter/setter pair, but
 * two of their rules are easy to get backwards:
 *
 * - getDeviceId must never return null, even when storage is broken —
 *   every caller (api.js, the leaderboard submit flow) treats it as an
 *   unconditional read;
 * - setDisplayName throws on invalid input but swallows on storage
 *   failure, which are deliberately different failure modes on the same
 *   function and easy to collapse into one by accident.
 */
import { describe, expect, it, vi } from "vitest";

import { getDeviceId, getDisplayName, setDisplayName } from "../src/stores/identityStore";

describe("getDeviceId", () => {
  it("mints and persists an id on first call", () => {
    const id = getDeviceId();

    expect(id).toEqual(expect.any(String));
    expect(id.length).toBeGreaterThan(0);
    expect(localStorage.getItem("sento:deviceId")).toBe(id);
  });

  it("returns the same id on every later call", () => {
    const first = getDeviceId();
    const second = getDeviceId();

    expect(second).toBe(first);
  });

  it("still returns a non-null id when storage rejects the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() => getDeviceId()).not.toThrow();
    expect(getDeviceId()).toEqual(expect.any(String));

    vi.restoreAllMocks();
  });
});

describe("getDisplayName / setDisplayName", () => {
  it("returns null before a name is ever set", () => {
    expect(getDisplayName()).toBeNull();
  });

  it("round-trips a name through storage", () => {
    setDisplayName("Phil");

    expect(getDisplayName()).toBe("Phil");
  });

  it("trims surrounding whitespace", () => {
    const stored = setDisplayName("  Yuki  ");

    expect(stored).toBe("Yuki");
    expect(getDisplayName()).toBe("Yuki");
  });

  it("caps length at 20 characters", () => {
    const stored = setDisplayName("a".repeat(30));

    expect(stored).toHaveLength(20);
  });

  it("rejects an empty name", () => {
    expect(() => setDisplayName("")).toThrow();
  });

  it("rejects a whitespace-only name", () => {
    expect(() => setDisplayName("   ")).toThrow();
  });

  it("swallows a storage failure instead of throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() => setDisplayName("Phil")).not.toThrow();

    vi.restoreAllMocks();
    expect(getDisplayName()).toBeNull();
  });
});
