import styles from "../../styles/SentenceListItem.module.css";

/**
 * One saved sentence row. List-style (not FlashcardCard's flip-card grid
 * tile) per the epic's explicit "List display, not grid" decision —
 * saved sentences are a browsing/management view, not a study surface.
 *
 * sentence: { id, jp_text, reading, meaning_en, folder_id }
 * folders: [{ id, name }] — for the relocate dropdown; Uncategorized
 * (folder_id=null) is always the first option, matching
 * SentenceFolderTree's own null-means-Uncategorized convention.
 */
export default function SentenceListItem({ sentence, folders, onRelocate, onDelete }) {
  return (
    <li className={styles.item}>
      <div className={styles.text}>
        <div className={styles.jp}>{sentence.jp_text}</div>
        <div className={styles.reading}>{sentence.reading}</div>
        <div className={styles.meaning}>{sentence.meaning_en}</div>
      </div>

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
    </li>
  );
}