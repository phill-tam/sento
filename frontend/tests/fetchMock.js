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
 *
 * Installed once per test, the first time mockFetchOnce is called —
 * keyed on whether global.fetch is already this module's spy, NOT on
 * whether the queue is currently non-empty. That distinction is load-
 * bearing: an earlier version kept a single spy alive only while the
 * queue held something, which silently swapped in a brand-new vi.fn()
 * (with an empty .mock.calls) the moment a test queued a second wave of
 * responses after the queue had drained to zero — exactly what a
 * multi-request flow (an initial GET, then a POST, then a re-fetch)
 * does. Calls made against the first spy vanished from any later
 * `fetch.mock.calls` assertion, caught by epic 015's leaderboard sync
 * test rather than by this file's own proof, which had only ever
 * exercised one call per test.
 */
import { afterEach, vi } from "vitest";

const queue = [];
let installed = false;

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

  if (!installed) {
    global.fetch = vi.fn(() => Promise.resolve(queue.shift() ?? makeResponse()));
    installed = true;
  }

  return response;
}

afterEach(() => {
  queue.length = 0;
  installed = false;
  delete global.fetch;
});
