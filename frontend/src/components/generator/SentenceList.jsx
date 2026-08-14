import { useState } from "react";
import SentenceListItem from "./SentenceListItem";
import ConfirmDialog from "../common/ConfirmDialog";
import styles from "../../styles/SentenceList.module.css";

// Enough of the sentence to recognise which row is about to go, without
// letting a long one push the dialog's buttons off screen.
const CONFIRM_PREVIEW_CHARS = 40;

/**
 * Saved-sentence browser. selectionMode/selectedIds/onToggleSelect/
 * selectionCap (epic 6): threaded straight through to each item,
 * mirroring FlashcardGrid's own threading of the same props down to
 * FlashcardCard. selectDisabled follows the identical rule FlashcardGrid
 * uses — capped only when the cap's reached AND the item isn't already
 * selected, so deselecting to free a slot always stays possible.
 *
 * epic 013 — owns the delete-confirm gate, the same way SentenceFolderTree
 * owns its own: one dialog for the whole list rather than one mounted per
 * row. Deleting used to fire straight from the row's ✕, which was
 * defensible while the row also existed on the server. It does not any
 * more — the browser holds the only copy, so a mis-click is unrecoverable.
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
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  if (sentences.length === 0) {
    return <p className={styles.empty}>No saved sentences in this folder yet.</p>;
  }

  const capReached = selectedIds.size >= selectionCap;
  const pending = sentences.find((s) => s.id === pendingDeleteId);

  function confirmDelete() {
    onDelete(pendingDeleteId);
    setPendingDeleteId(null);
  }

  return (
    <>
      <ul className={styles.list}>
        {sentences.map((sentence) => (
          <SentenceListItem
            key={sentence.id}
            sentence={sentence}
            folders={folders}
            onRelocate={onRelocate}
            onDelete={setPendingDeleteId}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(sentence.id)}
            onToggleSelect={onToggleSelect}
            selectDisabled={capReached && !selectedIds.has(sentence.id)}
          />
        ))}
      </ul>

      <ConfirmDialog
        open={pending != null}
        message={
          pending
            ? `Delete “${truncate(pending.jp_text)}”? It is saved only in this browser, so this cannot be undone.`
            : ""
        }
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}

function truncate(text) {
  return text.length > CONFIRM_PREVIEW_CHARS
    ? `${text.slice(0, CONFIRM_PREVIEW_CHARS)}…`
    : text;
}