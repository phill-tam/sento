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
 *
 * selectedCount: how many items are selected in TOTAL, when that differs
 * from `selectedIds.size`. Selection state above this component is keyed
 * by "lineId:itemId" and spans every content line, but this grid only
 * ever renders one line, so callers hand it the subset for the line on
 * screen. That subset is the right answer for which cards show a tick and
 * the wrong one for whether the cap is reached — a caller passing only
 * the subset would let a learner keep selecting on line B after filling
 * the cap on line A. Defaults to `selectedIds.size` so a caller whose
 * selection genuinely is single-line needs nothing.
 *
 * selectionLocked (epic 012): stay IN selection mode but refuse every
 * card. Used when a run is being built that this content line can't
 * contribute to — word pairs and a grammar category. Leaving selection
 * mode instead would be worse than it sounds: the ✓ is the MASTERY
 * toggle outside selection, so the same control would silently change
 * meaning and a learner reaching to select would mark cards mastered
 * instead. The caller is expected to say why nearby; this only makes the
 * refusal visible rather than mysterious.
 */
export default function FlashcardGrid({
  items,
  categoryLabel,
  mastered,
  onToggleMastered,
  selectionMode = false,
  selectedIds = new Set(),
  selectedCount,
  selectionLocked = false,
  onToggleSelect,
  selectionCap = 20,
  layout = "grid",
}) {
  if (items.length === 0) {
    return <p className={styles.empty}>No entries in this category yet.</p>;
  }

  const capReached = (selectedCount ?? selectedIds.size) >= selectionCap;
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
        selectDisabled={selectionLocked || (capReached && !selectedIds.has(item.id))}
        layout={layout}
      />
    );

    // Grid keeps the card as a direct child of .grid — no wrapper, so
    // the tile path's DOM is byte-for-byte what it was.
    return isList ? <li key={item.id}>{card}</li> : card;
  });

  return isList ? (
    <ul className={styles.list}>{cards}</ul>
  ) : (
    <div className={styles.grid}>{cards}</div>
  );
}
