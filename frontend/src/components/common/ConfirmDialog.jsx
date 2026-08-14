import { createPortal } from "react-dom";
import styles from "../../styles/ConfirmDialog.module.css";

/**
 * Generic confirm/cancel modal — fully controlled, no internal state.
 * Not quiz-specific: epic 004's quiz-in-progress guard is the first
 * caller, but this component has no knowledge of quizzes.
 *
 * confirmLabel/cancelLabel (epic 012): both default to the generic words
 * this shipped with, so every existing caller is unchanged. They exist
 * because the word-pairs entry warning is not a discard confirmation —
 * it explains that answers are sent to an AI provider, and "Confirm"
 * against that reads as agreeing to a warning rather than choosing to
 * begin. A dialog whose buttons name the action is answerable without
 * re-reading the message.
 *
 * epic 011 — portalled to <body> so its z-index:10 lands in the ROOT
 * stacking context rather than wherever the caller happens to sit.
 * App.jsx already rendered it outside .shell to get that (CLAUDE.md:
 * "anything that must cover both has to live outside .shell"), but
 * SentenceFolderTree renders one from *inside* the sidebar, where the
 * guarantee silently did not hold: z-index 10 was confined to
 * .lineRail's own context (z-index 1), so the icon rail (z-index 2)
 * painted over the modal backdrop and stayed clickable underneath it.
 * Making the component portal itself fixes both callers and stops the
 * contract depending on placement.
 *
 * This is load-bearing for the responsive drawer specifically: an
 * ancestor with a transform becomes the containing block for
 * position:fixed descendants, so once .lineRail became a transformed
 * drawer the backdrop stopped resolving against the viewport and was
 * clipped to the 320px drawer instead. Measured before the fix at
 * 390px: backdrop 319x788 rather than 390x844.
 */
export default function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
}) {
  if (!open) return null;

  return createPortal(
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={styles.confirmBtn} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}