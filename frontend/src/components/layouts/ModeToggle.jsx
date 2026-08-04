import styles from "../../styles/ModeToggle.module.css";

/**
 * Shared Study / Quiz / Sentence Generator toggle.
 * Study and Quiz are page-scoped view modes (controlled via `mode` + `onModeChange`).
 * Generator is not a mode of the current page — it's a navigation action
 * (`onGeneratorClick`), styled as a toggle button but semantically a link out.
 *
 * quizPhase/selectedCount/onStartQuiz (epic 004): when quizPhase is
 * "selecting", the Quiz button becomes "Start Quiz (n/20)" and calls
 * onStartQuiz instead of onModeChange — disabled below minSelection.
 * ModeToggle stays generic: it has no idea what a "quiz" is beyond these
 * props, matching the existing fully-controlled component pattern.
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
          className={styles.modeBtn}
          disabled={selectedCount < minSelection}
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