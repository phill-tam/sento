/**
 * Which content lines a run drew on, for the score record (epic 014).
 *
 * Shared by both runners because it is genuinely the same question —
 * unlike the score and denominator beside it in the record, which look
 * alike and are not. Those stay written out per runner: a choice quiz
 * scores out of its question count and a pairs run out of `gradedCount`,
 * and a shared "build the record" helper is exactly how the two get
 * flattened into one and the wrong denominator ends up stored.
 *
 * Items are the quiz-pool shape App.jsx assembles ({ id, lineId, ... }),
 * which both runners already receive as `selectedItems`.
 */
export function linesOf(items) {
  return [...new Set(items.map((item) => item.lineId))];
}
