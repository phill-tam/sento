/**
 * Test environment setup, run once before every test file.
 *
 * Empties storage between tests. jsdom gives each test *file* a fresh
 * window, not each test, so a store test that writes `sento:scores`
 * would otherwise seed whatever runs after it in the same file. That
 * failure surfaces in the wrong place — the test that breaks is the one
 * that ran second, not the one that left the data behind — which is an
 * expensive kind of flake to chase.
 *
 * Before that, it repairs `localStorage`, which is not present without
 * help. Node 22.4+ ships its own experimental Web Storage global, and
 * where it is enabled but unconfigured (no --localstorage-file) it
 * installs an accessor that yields undefined. Vitest's jsdom environment
 * does not overwrite a global that already exists, so Node's dead one
 * wins and jsdom's real Storage — still sitting on the window as
 * `_localStorage` — is never reachable under its own name. `typeof
 * window` passes throughout, which is what makes this a confusing
 * afternoon rather than an obvious error.
 *
 * Whether it bites depends on the Node version, so without this the
 * suite passes on CI's Node 22 and fails on a developer's Node 26, or
 * the reverse after either moves. Two cleaner-looking fixes do not work:
 * `poolOptions.forks.execArgv: ['--no-experimental-webstorage']` never
 * reaches the process that installs the global, and NODE_OPTIONS in the
 * npm script needs shell-specific syntax on Windows or a cross-env
 * dependency to avoid it.
 *
 * The guard matters as much as the assignment. Reading `_localStorage`
 * is reaching into jsdom's internals, so on a jsdom that no longer
 * exposes it — or a Node that has stopped shadowing the global — this
 * does nothing at all, and tests/harness.test.js is what fails, by name,
 * instead of every storage-touching suite failing obscurely.
 *
 * The app reaches for storage both ways — `localSentenceStore.js` writes
 * `window.localStorage`, `useMastered.js` writes bare `localStorage` —
 * and in a browser those are the same object, so the harness makes them
 * the same object here rather than asking new code to pick a defensive
 * spelling.
 *
 * `cleanup()` is called explicitly rather than relying on Testing
 * Library's auto-registration, which only happens when it detects a
 * global `afterEach`. That detection works today because `globals: true`
 * is set in vite.config.js, but it would silently stop working if that
 * changed, and a leaked component reads as a bug in the component rather
 * than in the harness.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

if (!globalThis.localStorage && window._localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    value: window._localStorage,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
