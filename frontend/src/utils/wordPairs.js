/**
 * Builds the pair tasks for one Word Pairs run (epic 012).
 *
 * The learner picks 2–4 kanji/vocab items and every unordered pair
 * becomes one task — C(n,2), so 1, 3 or 6 pairs. The cap is 4 rather
 * than 5 because C(5,2) is ten free-text sentences in a sitting, longer
 * than any other exercise in the app; see #126.
 *
 * Pure and synchronous. The hook calls this once at mount and freezes
 * the result, the same way useQuiz freezes its questions — a run whose
 * task order changed underneath the learner would be unusable.
 */

/**
 * Fisher-Yates. useQuiz.js has its own copy of this; unifying them means
 * touching shipped quiz code, so it is deliberately left duplicated
 * rather than folded into a feature commit. Six lines, no dependencies.
 */
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * "lineId:itemId" — the same composite key the selection state uses,
 * because an id alone cannot say which of the content tables it came
 * from once a run mixes kanji and vocab.
 */
function itemKey(item) {
  return `${item.lineId}:${item.id}`;
}

/**
 * Identifies a pair independently of how it is displayed.
 *
 * The two keys are sorted before joining, so the id is a property of
 * *which two items* are paired and not of which one the learner happens
 * to see first. That matters because the display order is shuffled: an
 * id derived from display order would change between building the pair
 * and grading it, and the grader realigns verdicts by exactly this
 * string.
 */
export function pairIdFor(a, b) {
  return [itemKey(a), itemKey(b)].sort().join("|");
}

/**
 * Every unordered pair of `items`, in shuffled order.
 *
 * Each pair's own `words` are shuffled too, so a 4-item run doesn't show
 * the same word in the left slot three times running. Returns [] for
 * fewer than two items rather than throwing — the picker's minimum is
 * enforced where the run starts, and this is a pure function with no
 * business asserting product rules.
 */
export function buildPairs(items) {
  if (!Array.isArray(items) || items.length < 2) return [];

  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push({
        pairId: pairIdFor(items[i], items[j]),
        words: shuffle([items[i], items[j]]),
      });
    }
  }

  return shuffle(pairs);
}

/**
 * The two words of a pair as the backend's SourceItemRef shape, in the
 * order they were shown.
 *
 * snake_case because it goes straight into a request body — the same
 * convention useSentenceGenerator follows for source_item_refs, rather
 * than adding a camelCase conversion layer this codebase doesn't have.
 */
export function pairWordRefs(pair) {
  return pair.words.map((item) => ({ line_id: item.lineId, item_id: item.id }));
}
