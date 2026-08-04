import ModeToggle from "../components/layouts/ModeToggle";
import FlashcardGrid from "../components/study/FlashcardGrid";
import styles from "../styles/StudyPage.module.css";

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
  const categoryLabel = activeCategoryId
    ? activeCategoryId
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "Select a category";

  return (
    <div className={styles.page}>
      <div className={styles.platformHead}>
        <div>
          <h1>
            <span className={styles.icon}>{activeLine?.icon}</span>
            {categoryLabel}
          </h1>
          <p>
            <span className={styles.crumbCat}>{activeLine?.label}</span>
            <span>{items.length} items</span>
          </p>
        </div>
        <ModeToggle mode={mode} onModeChange={onModeChange} onGeneratorClick={() => {}} />
      </div>

      <div className={styles.progressStrip}>
        <span>
          {masteredCount} / {items.length} mastered
        </span>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {isLoading ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        <FlashcardGrid
          items={items}
          categoryLabel={categoryLabel}
          mastered={mastered}
          onToggleMastered={onToggleMastered}
        />
      )}
    </div>
  );
}