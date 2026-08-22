/**
 * Guards which calls identify this device to the backend (epic 016).
 *
 * Two rules that are easy to get wrong in opposite directions, so both
 * are asserted rather than only the happy one:
 *
 * - the two metered calls must send X-Device-Id, or every user shares
 *   one anonymous budget and the app throttles itself;
 * - nothing else may send it. The raw id is a bearer credential for the
 *   leaderboard (ADR 021), so a well-meaning "just put it in request()"
 *   would spread it across every request the app makes.
 *
 * The first test is also the assertion phase 0 owed. request()'s header
 * merge shipped without one, because no exported function passed a
 * header until this change — so "Content-Type survives alongside a
 * caller's header" is checked here, at its first real caller, rather
 * than by exporting request() to test it in isolation.
 */
import { beforeEach, expect, it } from "vitest";

import { fetchLeaderboard, generateSentences, getKanji, gradePairAnswers } from "../src/api";
import { getDeviceId } from "../src/stores/identityStore";
import { mockFetchOnce } from "./fetchMock";

function headersOf(callIndex = 0) {
  const [, options] = global.fetch.mock.calls[callIndex];
  return options.headers;
}

beforeEach(() => {
  localStorage.clear();
});

it("sends the device id and keeps Content-Type on generateSentences", async () => {
  mockFetchOnce({ status: 200, body: { candidates: [] } });

  await generateSentences({ sourceItemRefs: [], count: 1, nuance: null });

  expect(headersOf()).toEqual({
    "Content-Type": "application/json",
    "X-Device-Id": getDeviceId(),
  });
});

it("sends the device id and keeps Content-Type on gradePairAnswers", async () => {
  mockFetchOnce({ status: 200, body: { verdicts: [] } });

  await gradePairAnswers({ answers: [] });

  expect(headersOf()).toEqual({
    "Content-Type": "application/json",
    "X-Device-Id": getDeviceId(),
  });
});

it("sends the same id for both, so they meter one device", async () => {
  mockFetchOnce({ status: 200, body: { candidates: [] } });
  mockFetchOnce({ status: 200, body: { verdicts: [] } });

  await generateSentences({ sourceItemRefs: [], count: 1, nuance: null });
  await gradePairAnswers({ answers: [] });

  expect(headersOf(0)["X-Device-Id"]).toBe(headersOf(1)["X-Device-Id"]);
});

it("does not send it on an unmetered read", async () => {
  mockFetchOnce({ status: 200, body: [] });

  await getKanji();

  expect(headersOf()).not.toHaveProperty("X-Device-Id");
});

it("does not send it on the leaderboard, which carries its id in the body", async () => {
  /** The distinction ADR 022 draws: metering metadata rides in a header,
   * domain data stays in the payload. Asserting it here stops a future
   * "make it consistent" change from moving one to match the other. */
  mockFetchOnce({ status: 200, body: { entries: [] } });

  await fetchLeaderboard();

  expect(headersOf()).not.toHaveProperty("X-Device-Id");
});
