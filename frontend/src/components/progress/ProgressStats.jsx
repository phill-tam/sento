import { labelFor } from "../../utils/quizTypeLabel";
import styles from "../../styles/ProgressStats.module.css";

/**
 * Lifetime totals across every recorded run (epic 014).
 *
 * Accuracy is per *answer*, not per run — 10/10 followed by 0/2 reads as
 * 83%, not as the 50% a mean-of-means would give. readStats does that
 * arithmetic; this renders it.
 *
 * A null accuracy is "nothing has been graded yet", which is a different
 * thing from 0% and is shown as a dash rather than a number. The two
 * coincide only for a learner who has never got an answer right, and
 * telling them they are at 0% when they have simply not started is the
 * wrong greeting.
 */
function pct(accuracy) {
  return accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`;
}

function Tile({ label, value, detail }) {
  return (
    <div className={styles.tile}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {detail && <div className={styles.detail}>{detail}</div>}
    </div>
  );
}

export default function ProgressStats({ stats }) {
  const { overall, byType, best } = stats;

  return (
    <div className={styles.tiles}>
      <Tile
        label="Accuracy"
        value={pct(overall.accuracy)}
        detail={overall.total > 0 ? `${overall.score} of ${overall.total} answers` : null}
      />
      <Tile
        label="Runs"
        value={overall.runs}
        detail={
          overall.runs > overall.gradedRuns
            ? `${overall.runs - overall.gradedRuns} not graded`
            : null
        }
      />
      <Tile
        label="Quiz"
        value={pct(byType.choice.accuracy)}
        detail={`${byType.choice.runs} ${byType.choice.runs === 1 ? "run" : "runs"}`}
      />
      <Tile
        label="Word pairs"
        value={pct(byType.pairs.accuracy)}
        detail={`${byType.pairs.runs} ${byType.pairs.runs === 1 ? "run" : "runs"}`}
      />
      {best && (
        <Tile label="Best run" value={`${best.score} / ${best.total}`} detail={labelFor(best.quizType)} />
      )}
    </div>
  );
}
