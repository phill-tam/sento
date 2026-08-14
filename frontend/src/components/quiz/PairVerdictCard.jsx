import styles from "../../styles/PairVerdictCard.module.css";

/**
 * One graded pair on the results screen (epic 012).
 *
 * Four verdicts, three of which are not "wrong":
 *
 *   correct     — both words used in the right sense
 *   incorrect   — a real attempt that got a sense wrong or missed a word
 *   ungradeable — off-task, or the provider didn't return this pair
 *   skipped     — left blank, client-side only, never sent
 *
 * Keeping ungradeable and skipped visually distinct from incorrect is the
 * whole point of this component. A learner whose provider call partly
 * failed must not read it as having got answers wrong, and the summary
 * keeps both out of the denominator for the same reason.
 *
 * The learner's own sentence is echoed back. Feedback that says "you used
 * 'run' to mean manage" is unreadable next to a sentence you can no
 * longer see, and by results time it may be six pairs ago.
 */
export default function PairVerdictCard({ pair, answer, verdict }) {
  if (!pair || !verdict) return null;

  const kind = verdict.verdict;
  const words = verdict.words ?? [];

  return (
    <li className={`${styles.card} ${styles[kind] ?? ""}`}>
      <div className={styles.head}>
        <span className={styles.words}>
          {pair.words.map((item) => item.prompt).join("  ·  ")}
        </span>
        <span className={styles.badge}>{LABELS[kind] ?? kind}</span>
      </div>

      {answer?.trim() ? (
        <p className={styles.answer}>“{answer.trim()}”</p>
      ) : (
        <p className={styles.noAnswer}>No sentence written.</p>
      )}

      <p className={styles.feedback}>{verdict.feedback}</p>

      {/* Per-word detail only when the grader actually judged the words.
          An empty list is the normal shape for skipped and locally-
          resolved pairs, not a missing-data case to render around. */}
      {words.length > 0 ? (
        <ul className={styles.wordList}>
          {words.map((word, i) => {
            // Matched on identity, not position. The backend echoes
            // line_id/item_id from the request precisely so this is
            // possible, and the grading service refuses to align verdicts
            // positionally for the same reason — a mismatch here would
            // label the wrong word "wrong sense" and read as confident
            // feedback rather than an error. Index is the fallback only
            // when identity is absent.
            const item =
              pair.words.find(
                (candidate) =>
                  candidate.lineId === word.line_id && candidate.id === word.item_id
              ) ?? pair.words[i];
            const ok = word.used && word.sense_ok;
            return (
              <li key={`${word.line_id}:${word.item_id}`} className={styles.wordRow}>
                <span className={ok ? styles.wordOk : styles.wordBad} aria-hidden="true">
                  {ok ? "✓" : "✕"}
                </span>
                <span className={styles.wordJp}>{item?.prompt ?? ""}</span>
                <span className={styles.wordNote}>
                  {!word.used
                    ? "not used"
                    : word.sense_ok
                    ? "right sense"
                    : "wrong sense"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {verdict.suggestion ? (
        <p className={styles.suggestion}>
          <span className={styles.suggestionLabel}>Try:</span> {verdict.suggestion}
        </p>
      ) : null}
    </li>
  );
}

const LABELS = {
  correct: "Correct",
  incorrect: "Not quite",
  ungradeable: "Not checked",
  skipped: "Skipped",
};
