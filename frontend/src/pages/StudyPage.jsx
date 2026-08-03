import ModeToggle from "../components/layouts/ModeToggle";
import FlashcardGrid from "../components/study/FlashcardGrid";
import styles from "../styles/StudyPage.module.css";

/**
 * Presentational only. App.jsx owns fetching, tree/search state, and the
 * three useMastered instances — it also owns the real sidebar's search
 * input and CategoryTree, and both need to share one set of state, so
 * lifting it up removes the duplicate search bar this page used to render
 * in its own treePanel. StudyPage just renders the active category's
 * header, progress bar, ModeToggle, and card grid.
 */
export default function StudyPage({
  activeLine,
  activeCategoryId,
  items,
  mastered,
  onToggleMastered,
  masteredCount,
  progressPct,
  isLoading,
  mode,
  onModeChange,
}) {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {activeCategoryId
              ? activeCategoryId
                  .split("_")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ")
              : "Select a category"}
          </h1>
          {activeLine && (
            <p className={styles.subline}>
              {activeLine.label} · {masteredCount}/{items.length} {activeLine.unitLabel} mastered
            </p>
          )}
        </div>
        <ModeToggle mode={mode} onModeChange={onModeChange} onGeneratorClick={() => {}} />
      </div>

      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
      </div>

      {isLoading ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        <FlashcardGrid items={items} mastered={mastered} onToggleMastered={onToggleMastered} />
      )}
    </div>
  );
}