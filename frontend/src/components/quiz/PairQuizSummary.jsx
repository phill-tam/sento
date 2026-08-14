import PairVerdictCard from "./PairVerdictCard";
import styles from "../../styles/PairQuizSummary.module.css";

/**
 * End of a Word Pairs run (epic 012).
 *
 * The score reads "n of m" where m is the number of pairs the grader
 * actually judged, NOT the number of pairs in the run. A run where the
 * provider dropped two pairs must not present as "4 of 6, you got two
 * wrong" — those two were never marked. Skipped and unchecked counts are
 * stated separately underneath so the arithmetic is visible rather than
 * silently lossy.
 *
 * When nothing was graded at all there is no score to show, so the card
 * says so instead of rendering "0 of 0".
 */
export default function PairQuizSummary({ pairs, answers, verdicts, results, onFinish }) {
  const { score, gradedCount, skippedCount, ungradedCount } = results;
  const hasScore = gradedCount > 0;

  return (
    <div className={styles.summary}>
      <div className={styles.scoreBlock}>
        <span className={styles.eyebrow}>Word pairs</span>
        {hasScore ? (
          <>
            <p className={styles.score}>
              <strong>{score}</strong> of {gradedCount}
            </p>
            <p className={styles.scoreNote}>
              {score === gradedCount
                ? "Every sense right."
                : "Sentences using both words in the right sense."}
            </p>
          </>
        ) : (
          <p className={styles.scoreNote}>Nothing was graded this run.</p>
        )}

        {skippedCount > 0 || ungradedCount > 0 ? (
          <p className={styles.asides}>
            {[
              skippedCount > 0 ? `${skippedCount} skipped` : null,
              ungradedCount > 0 ? `${ungradedCount} not checked` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>

      {/* Iterating `pairs` rather than the verdict map keeps the results
          in the order the learner wrote them. A map's key order would
          follow whatever the response happened to contain. */}
      <ul className={styles.list}>
        {pairs.map((pair) => (
          <PairVerdictCard
            key={pair.pairId}
            pair={pair}
            answer={answers[pair.pairId]}
            verdict={verdicts[pair.pairId]}
          />
        ))}
      </ul>

      <button type="button" className={styles.finishBtn} onClick={onFinish}>
        Done
      </button>
    </div>
  );
}
