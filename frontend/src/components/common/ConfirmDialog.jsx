import styles from "../../styles/ConfirmDialog.module.css";

/**
 * Generic confirm/cancel modal — fully controlled, no internal state.
 * Not quiz-specific: epic 004's quiz-in-progress guard is the first
 * caller, but this component has no knowledge of quizzes.
 */
export default function ConfirmDialog({ open, message, onConfirm, onCancel }) {
  if (!open) return null;

  return (
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
    </div>
  );
}