import styles from "../../styles/ModeToggle.module.css";

/**
 * Shared Study / Quiz / Sentence Generator toggle.
 * Study and Quiz are page-scoped view modes (controlled via `mode` + `onModeChange`).
 * Generator is not a mode of the current page — it's a navigation action
 * (`onGeneratorClick`) UNLESS generatorPhase is "selecting", in which case
 * it behaves like Quiz's own selecting phase: the button transforms into
 * a live "Continue (n/5)" counter instead of firing onGeneratorClick.
 *
 * quizPhase/selectedCount/onStartQuiz (epic 004): when quizPhase is
 * "selecting", the Quiz button becomes "Start Quiz (n/20)" with two
 * visual sub-states — dimmed/pending below minSelection, gold/ready at
 * or above it — so the count itself signals readiness without extra text.
 *
 * generatorPhase/generatorSelectedCount/onContinueGenerator (epic 005):
 * same pending/ready treatment, parameterized with the Generator's own
 * cap (default 5) and minimum (default 2) instead of Quiz's 20/4. Kept
 * as fully separate props from Quiz's — the two aren't the same state
 * machine.
 *
 * The two selecting phases are mutually exclusive, and App.jsx is what
 * makes that true: handleModeChange and handleGeneratorClick each clear
 * the other's phase and selection. This comment used to assert the
 * exclusion as a standing fact while nothing enforced it, so both
 * counters could render side by side. Don't rely on it here — this
 * component will happily render both if it is handed both.
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
  generatorPhase = "idle",
  generatorSelectedCount = 0,
  generatorSelectionCap = 5,
  generatorMinSelection = 2,
  onContinueGenerator,
}) {
  const isSelecting = quizPhase === "selecting";
  const quizReady = selectedCount >= minSelection;

  const isGeneratorSelecting = generatorPhase === "selecting";
  const generatorReady = generatorSelectedCount >= generatorMinSelection;

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

      {isGeneratorSelecting ? (
        <button
          type="button"
          className={`${styles.modeBtn} ${styles.modeBtnAi} ${
            generatorReady ? styles.generatorReady : styles.generatorPending
          }`}
          disabled={!generatorReady}
          onClick={onContinueGenerator}
        >
          Continue ({generatorSelectedCount}/{generatorSelectionCap})
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.modeBtn} ${styles.modeBtnAi}`}
          title="AI-powered — generates a sentence using your studied items"
          onClick={onGeneratorClick}
        >
          ✧ Sentence Generator
        </button>
      )}
    </div>
  );
}