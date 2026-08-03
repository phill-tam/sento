import FlashcardCard from "./FlashcardCard";
import styles from "../../styles/FlashcardGrid.module.css";

/**
 * Responsive grid over FlashcardCard (step 6). Purely a layout + mastered-
 * lookup wrapper — no fetching, no flip state (that's each card's own).
 *
 * items: FlashcardItem[] — see FlashcardCard.jsx for the shape
 * mastered: Set<id> — from useMastered(lineId) (step 5)
 * onToggleMastered: (id) => void — from the same hook's toggle
 */
export default function FlashcardGrid({ items, mastered, onToggleMastered }) {
  if (items.length === 0) {
    return <p className={styles.empty}>No entries in this category yet.</p>;
  }

  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <FlashcardCard
          key={item.id}
          item={item}
          isMastered={mastered.has(item.id)}
          onToggleMastered={onToggleMastered}
        />
      ))}
    </div>
  );
}