import FlashcardCard from "./FlashcardCard";
import styles from "../../styles/FlashcardGrid.module.css";

/**
 * selectionMode/selectedIds/onToggleSelect (epic 004): threaded straight
 * through to each card. selectionCap enforces the 20-item max — a card
 * gets selectDisabled only when the cap is reached AND it isn't already
 * selected, matching FlashcardCard's own "never block deselecting" rule.
 *
 * layout (epic 010): "grid" is the auto-fill tile grid; "list" wraps the
 * same cards in a <ul> of full-width rows for categories whose content
 * doesn't fit a tile. Only the container and the prop passed down change
 * — the cards themselves are constructed identically either way. The
 * caller decides; see utils/categoryLayout.js.
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
  layout = "grid",
}) {
  if (items.length === 0) {
    return <p className={styles.empty}>No entries in this category yet.</p>;
  }

  const capReached = selectedIds.size >= selectionCap;
  const isList = layout === "list";

  const cards = items.map((item) => {
    const card = (
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
        layout={layout}
      />
    );

    // Grid keeps the card as a direct child of .grid — no wrapper, so
    // the tile path's DOM is byte-for-byte what it was.
    return isList ? (
      <li key={item.id} className={styles.row}>
        {card}
      </li>
    ) : (
      card
    );
  });

  return isList ? (
    <ul className={styles.list}>{cards}</ul>
  ) : (
    <div className={styles.grid}>{cards}</div>
  );
}
