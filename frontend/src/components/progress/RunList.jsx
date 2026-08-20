import { labelFor } from "../../utils/quizTypeLabel";
import styles from "../../styles/RunList.module.css";

/**
 * The recorded runs, newest first (epic 014).
 *
 * The score reads exactly as it read on the summary card that produced
 * it, because the record stored the denominator that was shown rather
 * than the length of the run. Skipped and unchecked counts are stated
 * beside it in the same wording PairQuizSummary uses, so the arithmetic
 * of a partly-graded run stays visible here too — a row saying "3 / 4"
 * with "2 not checked" beside it is honest in a way that "3 / 6" would
 * not be.
 *
 * A run the grader never scored has no ratio to show at all and says so,
 * matching the card's "Nothing was graded this run."
 */
function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export default function RunList({ runs }) {
  return (
    <ul className={styles.list}>
      {runs.map((run) => {
        const asides = [
          run.skippedCount > 0 ? `${run.skippedCount} skipped` : null,
          run.ungradedCount > 0 ? `${run.ungradedCount} not checked` : null,
        ].filter(Boolean);

        return (
          <li key={run.id} className={styles.row}>
            <span className={styles.date}>{formatDate(run.completedAt)}</span>
            <span className={styles.type}>{labelFor(run.quizType)}</span>
            <span className={styles.score}>
              {run.total > 0 ? `${run.score} / ${run.total}` : "Not graded"}
            </span>
            {asides.length > 0 && <span className={styles.asides}>{asides.join(" · ")}</span>}
          </li>
        );
      })}
    </ul>
  );
}
