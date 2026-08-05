import styles from "../../styles/SentenceListItem.module.css";

/**
 * One saved sentence row. List-style (not FlashcardCard's flip-card grid
 * tile) per epic 5's explicit "List display, not grid" decision.
 *
 * selectionMode (epic 6): when true, this row is selectable for a global
 * quiz run — mirrors FlashcardCard's selectionMode/isSelected/
 * onToggleSelect/selectDisabled contract exactly, bare sentence id in,
 * bare id out. The relocate/delete controls are swapped out for a
 * checkbox while selecting, rather than shown alongside it — avoids
 * accidental relocate/delete while picking quiz items, same reasoning
 * as FlashcardCard's mark button changing meaning instead of adding a
 * second control.
 */
export default function SentenceListItem({
  sentence,
  folders,
  onRelocate,
  onDelete,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  selectDisabled = false,
}) {
  return (
    <li className={`${styles.item} ${selectionMode && isSelected ? styles.selected : ""}`}>
      <div className={styles.text}>
        <div className={styles.jp}>{sentence.jp_text}</div>
        <div className={styles.reading}>{sentence.reading}</div>
        <div className={styles.meaning}>{sentence.meaning_en}</div>
      </div>

      {selectionMode ? (
        <button
          type="button"
          className={`${styles.checkBtn} ${isSelected ? styles.checkBtnOn : ""}`}
          disabled={selectDisabled}
          aria-pressed={isSelected}
          aria-label={isSelected ? "Deselect for quiz" : "Select for quiz"}
          onClick={() => onToggleSelect(sentence.id)}
        >
          ✓
        </button>
      ) : (
        <div className={styles.actions}>
          <select
            className={styles.folderSelect}
            value={sentence.folder_id ?? ""}
            onChange={(e) => onRelocate(sentence.id, e.target.value || null)}
          >
            <option value="">Uncategorized</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.deleteBtn}
            title="Delete sentence"
            onClick={() => onDelete(sentence.id)}
          >
            ✕
          </button>
        </div>
      )}
    </li>
  );
}