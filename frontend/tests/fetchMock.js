/**
 * Minimal `fetch` mock for tests exercising api.js (epic 015's Step 0b).
 *
 * No MSW. Nothing in this codebase has mocked `fetch` before — every
 * existing frontend test either stubs a hook one level above the
 * network (recordQuizRuns.test.jsx mocks usePairWriting itself) or
 * touches real `localStorage` (scoreStore.test.js, progressPage.test.jsx).
 * api.js's `request()` is one small wrapper around the Response contract,
 * not a surface wide enough to justify a request-matching library — this
 * covers exactly what `request()` reads off a Response: `ok`, `status`,
 * `statusText`, and `json()`.
 *
 * Deliberately covers HTTP-level responses only (status codes, JSON
 * bodies), not a network-level rejection (fetch itself throwing). No
 * caller needed that distinction yet; add a reject helper when one does
 * rather than guessing its shape now.
 *
 * mockFetchOnce queues responses in call order — the first call to
 * fetch during the test gets the first queued response, the second call
 * gets the second, and so on. A test making one request calls it once.
 * `global.fetch` itself is a real `vi.fn()`, so assertions on what was
 * requested (URL, method, body) read it directly via `fetch.mock.calls`
 * rather than through a second assertion helper.
 */
import { afterEach, vi } from "vitest";

const queue = [];

function makeResponse({ status = 200, body = null, statusText = "" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  };
}

export function mockFetchOnce(responseInit) {
  const response = makeResponse(responseInit);
  queue.push(response);

  // Installed once per test, on the first call — a test that never
  // calls this leaves global.fetch untouched, so suites that don't need
  // it are unaffected.
  if (queue.length === 1) {
    global.fetch = vi.fn(() => Promise.resolve(queue.shift() ?? makeResponse()));
  }

  return response;
}

afterEach(() => {
  queue.length = 0;
  delete global.fetch;
});
