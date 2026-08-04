import styles from "../../styles/QuizSummary.module.css";

/**
 * Ephemeral score display shown once quiz phase reaches "complete".
 * Score is never persisted — Finish clears quiz state entirely (App.jsx,
 * Step 13) and returns to the normal study grid.
 */
export default function QuizSummary({ score, totalQuestions, onFinish }) {
  const pct = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  return (
    <div className={styles.card}>
      <div className={styles.scoreLabel}>Quiz complete</div>
      <div className={styles.score}>
        {score} / {totalQuestions}
      </div>
      <div className={styles.pct}>{pct}% correct</div>
      <button type="button" className={styles.finishBtn} onClick={onFinish}>
        Finish
      </button>
    </div>
  );
}