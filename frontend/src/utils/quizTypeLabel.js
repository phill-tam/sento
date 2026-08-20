/**
 * Display name for a stored run's quizType (epic 014).
 *
 * Its own file rather than an export beside one of the two components
 * that use it: a module exporting both a component and a helper breaks
 * Fast Refresh, which is what oxlint's only-export-components rule is
 * for. "Word pairs" matches PairQuizSummary's own eyebrow, so a run
 * reads the same on the Progress page as it did on the card that
 * recorded it.
 */
export function labelFor(quizType) {
  return quizType === "pairs" ? "Word pairs" : "Quiz";
}
