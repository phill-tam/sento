import styles from "../../styles/QuizEmptyState.module.css";

/**
 * Rendered by StudyPage in place of ModeToggle's "Quiz me" button when
 * the active category has fewer than 4 items — quiz needs a minimum of
 * 4 to guarantee both a valid selection and a distractor pool.
 */
export default function QuizEmptyState({ itemCount, minRequired = 4 }) {
  return (
    <div className={styles.wrapper}>
      Need at least {minRequired} items to quiz this category ({itemCount} available)
    </div>
  );
}