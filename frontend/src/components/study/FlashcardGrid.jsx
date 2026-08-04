import FlashcardCard from "./FlashcardCard";
import styles from "../../styles/FlashcardGrid.module.css";

/**
 * selectionMode/selectedIds/onToggleSelect (epic 004): threaded straight
 * through to each card. selectionCap enforces the 20-item max — a card
 * gets selectDisabled only when the cap is reached AND it isn't already
 * selected, matching FlashcardCard's own "never block deselecting" rule.
 */
export default function FlashcardGrid({
  items,
  categoryLabel,
  mastered,
  onToggleMastered,
  selectionMode = false,
  selectedIds = new Set(),
  onToggleSelect,
  selectionCap = 20,
}) {
  if (items.length === 0) {
    return <p className={styles.empty}>No entries in this category yet.</p>;
  }

  const capReached = selectedIds.size >= selectionCap;

  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <FlashcardCard
          key={item.id}
          item={item}
          categoryLabel={categoryLabel}
          isMastered={mastered.has(item.id)}
          onToggleMastered={onToggleMastered}
          selectionMode={selectionMode}
          isSelected={selectedIds.has(item.id)}
          onToggleSelect={onToggleSelect}
          selectDisabled={capReached && !selectedIds.has(item.id)}
        />
      ))}
    </div>
  );
}