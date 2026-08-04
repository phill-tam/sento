import styles from "../../styles/ModeToggle.module.css";

/**
 * Shared Study / Quiz / Sentence Generator toggle.
 * Study and Quiz are page-scoped view modes (controlled via `mode` + `onModeChange`).
 * Generator is not a mode of the current page — it's a navigation action
 * (`onGeneratorClick`), styled as a toggle button but semantically a link out.
 *
 * quizPhase/selectedCount/onStartQuiz (epic 004): when quizPhase is
 * "selecting", the Quiz button becomes "Start Quiz (n/20)" with two
 * visual sub-states — dimmed/pending below minSelection, gold/ready at
 * or above it — so the count itself signals readiness without extra text.
 */
export default function ModeToggle({
  mode,
  onModeChange,
  onGeneratorClick,
  quizPhase = "idle",
  selectedCount = 0,
  selectionCap = 20,
  minSelection = 4,
  onStartQuiz,
}) {
  const isSelecting = quizPhase === "selecting";
  const quizReady = selectedCount >= minSelection;

  return (
    <div className={styles.modeToggle}>
      <button
        type="button"
        className={`${styles.modeBtn} ${mode === "study" ? styles.active : ""}`}
        onClick={() => onModeChange("study")}
      >
        Study
      </button>
      {isSelecting ? (
        <button
          type="button"
          className={`${styles.modeBtn} ${quizReady ? styles.quizReady : styles.quizPending}`}
          disabled={!quizReady}
          onClick={onStartQuiz}
        >
          Start Quiz ({selectedCount}/{selectionCap})
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.modeBtn} ${mode === "quiz" ? styles.active : ""}`}
          onClick={() => onModeChange("quiz")}
        >
          Quiz me
        </button>
      )}
      <button
        type="button"
        className={`${styles.modeBtn} ${styles.modeBtnAi}`}
        title="AI-powered — generates a sentence using your studied items"
        onClick={onGeneratorClick}
      >
        ✨ Sentence Generator
      </button>
    </div>
  );
}