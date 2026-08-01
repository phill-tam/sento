import styles from "../../styles/ModeToggle.module.css";

/**
 * Shared Study / Quiz / Sentence Generator toggle.
 * Study and Quiz are page-scoped view modes (controlled via `mode` + `onModeChange`).
 * Generator is not a mode of the current page — it's a navigation action
 * (`onGeneratorClick`), styled as a toggle button but semantically a link out.
 */
export default function ModeToggle({ mode, onModeChange, onGeneratorClick }) {
  return (
    <div className={styles.modeToggle}>
      <button
        type="button"
        className={`${styles.modeBtn} ${mode === "study" ? styles.active : ""}`}
        onClick={() => onModeChange("study")}
      >
        Study
      </button>
      <button
        type="button"
        className={`${styles.modeBtn} ${mode === "quiz" ? styles.active : ""}`}
        onClick={() => onModeChange("quiz")}
      >
        Quiz me
      </button>
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