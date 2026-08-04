import FlashcardCard from "./FlashcardCard";
import styles from "../../styles/FlashcardGrid.module.css";

export default function FlashcardGrid({ items, categoryLabel, mastered, onToggleMastered }) {
  if (items.length === 0) {
    return <p className={styles.empty}>No entries in this category yet.</p>;
  }

  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <FlashcardCard
          key={item.id}
          item={item}
          categoryLabel={categoryLabel}
          isMastered={mastered.has(item.id)}
          onToggleMastered={onToggleMastered}
        />
      ))}
    </div>
  );
}