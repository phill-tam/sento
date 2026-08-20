/**
 * Proves the harness runs at all, and that its two guarantees hold.
 *
 * Not a placeholder. Every later test file — the score store's, the two
 * runners' — assumes a jsdom window whose `localStorage` is both usable
 * and empty at the start of each test. Neither is free: bare
 * `localStorage` resolves to Node's own unconfigured Web Storage global
 * on some runtimes (see tests/setup.js), and jsdom resets a window per
 * file rather than per test. If either guarantee lapses, those suites do
 * not fail loudly — they fail intermittently, in whichever test happened
 * to run after one that wrote a key. This file makes that breakage land
 * here instead, under an obvious name.
 *
 * The last two cases are order-dependent on purpose: the second writes a
 * key and the third asserts it is gone, which is the only way to observe
 * the afterEach actually firing.
 */

it("resolves localStorage to jsdom's, not Node's Web Storage global", () => {
  expect(typeof window).toBe("object");
  expect(localStorage).toBe(window.localStorage);
  expect(typeof localStorage.setItem).toBe("function");
});

it("allows a test to write to localStorage", () => {
  localStorage.setItem("sento:__harness__", "1");
  expect(localStorage.getItem("sento:__harness__")).toBe("1");
});

it("clears localStorage before the next test", () => {
  expect(localStorage.getItem("sento:__harness__")).toBeNull();
});
