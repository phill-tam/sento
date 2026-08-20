/**
 * Proves the fetch mock actually satisfies api.js's request(), not just
 * that a mocked Response object looks plausible in isolation — mirrors
 * harness.test.js's role for localStorage. If this drifts from what
 * request() actually reads off a Response, every test built on it later
 * fails for the wrong reason: the test looks broken, the mock is.
 *
 * Runs real api.js calls against the mock rather than reimplementing
 * request()'s behaviour here, so a future change to request() (a new
 * header, a different error shape) is caught by this file instead of by
 * whichever leaderboard test happens to exercise that path first.
 *
 * The last case is order-dependent on purpose, same as harness.test.js's
 * third case: it is the only way to observe the afterEach clearing the
 * queue and deleting global.fetch between tests.
 */
import { expect, it } from "vitest";

import { RateLimitError, getKanji } from "../src/api";
import { mockFetchOnce } from "./fetchMock";

it("resolves a real api.js call through the mocked response", async () => {
  mockFetchOnce({ status: 200, body: [{ id: "k1" }] });

  const result = await getKanji();

  expect(result).toEqual([{ id: "k1" }]);
  expect(global.fetch).toHaveBeenCalledWith(
    "http://localhost:8000/api/v1/kanji",
    expect.objectContaining({ headers: { "Content-Type": "application/json" } })
  );
});

it("turns the rate-limit body shape into RateLimitError, same as a real 429", async () => {
  mockFetchOnce({
    status: 429,
    statusText: "Too Many Requests",
    body: { detail: { error: "rate_limit_exceeded", detail: "slow down" } },
  });

  await expect(getKanji()).rejects.toBeInstanceOf(RateLimitError);
});

it("leaves no mocked fetch behind for the next test", () => {
  expect(global.fetch).toBeUndefined();
});
