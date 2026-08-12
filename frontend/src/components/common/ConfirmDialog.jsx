import { createPortal } from "react-dom";
import styles from "../../styles/ConfirmDialog.module.css";

/**
 * Generic confirm/cancel modal — fully controlled, no internal state.
 * Not quiz-specific: epic 004's quiz-in-progress guard is the first
 * caller, but this component has no knowledge of quizzes.
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
export default function ConfirmDialog({ open, message, onConfirm, onCancel }) {
  if (!open) return null;

  return createPortal(
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={styles.confirmBtn} onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}