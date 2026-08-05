import SentenceListItem from "./SentenceListItem";
import styles from "../../styles/SentenceList.module.css";

/**
 * Saved-sentence browser. selectionMode/selectedIds/onToggleSelect/
 * selectionCap (epic 6): threaded straight through to each item,
 * mirroring FlashcardGrid's own threading of the same props down to
 * FlashcardCard. selectDisabled follows the identical rule FlashcardGrid
 * uses — capped only when the cap's reached AND the item isn't already
 * selected, so deselecting to free a slot always stays possible.
 */
export default function SentenceList({
  sentences,
  folders,
  onRelocate,
  onDelete,
  selectionMode = false,
  selectedIds = new Set(),
  onToggleSelect,
  selectionCap = 20,
}) {
  if (sentences.length === 0) {
    return <p className={styles.empty}>No saved sentences in this folder yet.</p>;
  }

  const capReached = selectedIds.size >= selectionCap;

  return (
    <ul className={styles.list}>
      {sentences.map((sentence) => (
        <SentenceListItem
          key={sentence.id}
          sentence={sentence}
          folders={folders}
          onRelocate={onRelocate}
          onDelete={onDelete}
          selectionMode={selectionMode}
          isSelected={selectedIds.has(sentence.id)}
          onToggleSelect={onToggleSelect}
          selectDisabled={capReached && !selectedIds.has(sentence.id)}
        />
      ))}
    </ul>
  );
}