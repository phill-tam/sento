/**
 * Decides which answers are worth spending a provider call on (epic 012).
 *
 * Pure, so the rule can be checked without standing up a run. It is the
 * only thing that suppresses a grading call, which is why it is built to
 * UNDER-trigger: a false positive tells a learner who wrote a perfectly
 * good sentence that they didn't use the words, and that is worse than
 * the call it saved.
 *
 * It never marks anything correct. Word *presence* is checkable locally;
 * word *sense* is the entire reason a model is involved, and this must
 * not be mistaken for a shortcut around it.
 */

import { pairWordRefs } from "./wordPairs";

/** Client-only verdict for a pair the learner left blank. */
export const SKIPPED = "skipped";

/**
 * Gloss tokens worth matching on, from an item's English meaning.
 *
 * Meanings arrive as "day / sun" or "to run", so alternatives split on
 * "/" and every word is considered. Tokens under three characters are
 * dropped — matching "to", "up" or "on" against free text would hit
 * almost anything.
 */
export function glossTokens(item) {
  return (item?.answer ?? "")
    .split("/")
    .flatMap((alt) => alt.trim().split(/\s+/))
    .map((word) => word.replace(/[^a-z]/gi, "").toLowerCase())
    .filter((word) => word.length >= 3 && word !== "the");
}

/**
 * True only when NEITHER word appears, on a loose four-character prefix
 * match.
 *
 * One word present is enough to send the pair on and let the model
 * decide. That asymmetry is deliberate: irregular forms — ran, saw, went,
 * ate — do not prefix-match their gloss at all, so a per-word gate would
 * reject correct English regularly. Requiring both to be missing keeps
 * the check to the case that is unambiguous.
 */
export function looksOffTask(answer, words) {
  const haystack = answer.toLowerCase();
  return !words.some((item) =>
    glossTokens(item).some((token) => haystack.includes(token.slice(0, 4)))
  );
}

/**
 * Splits a run into what is resolved locally and what has to be graded.
 *
 * `local` is keyed by pairId and already verdict-shaped. `toGrade` is
 * already request-shaped, snake_case included, so the hook hands it
 * straight to the API.
 */
export function partitionAnswers(pairs, answers) {
  const local = {};
  const toGrade = [];

  for (const pair of pairs) {
    const text = (answers[pair.pairId] ?? "").trim();

    if (!text) {
      local[pair.pairId] = {
        pairId: pair.pairId,
        verdict: SKIPPED,
        feedback: "Skipped.",
        words: [],
      };
    } else if (looksOffTask(text, pair.words)) {
      local[pair.pairId] = {
        pairId: pair.pairId,
        verdict: "ungradeable",
        feedback: "You didn't use both words.",
        words: [],
      };
    } else {
      toGrade.push({ pair_id: pair.pairId, words: pairWordRefs(pair), answer: text });
    }
  }

  return { local, toGrade };
}
