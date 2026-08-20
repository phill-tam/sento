import { useState } from "react";
import { createPortal } from "react-dom";

import { MAX_DISPLAY_NAME_LENGTH } from "../../stores/identityStore";
import styles from "../../styles/LeaderboardSyncDialog.module.css";

/**
 * Name entry + sync action for the leaderboard (epic 015).
 *
 * Local input state, unlike ConfirmDialog's fully-controlled shape —
 * this is a small form, not a reusable yes/no prompt, and nothing
 * outside the dialog needs to observe keystrokes. Pre-fills from
 * whatever name was last synced (`initialName`), so a returning learner
 * re-syncing doesn't retype it.
 *
 * The message states plainly that names aren't unique or verified —
 * ADR 021 — rather than let a learner assume otherwise from a
 * leaderboard's usual conventions.
 */
export default function LeaderboardSyncDialog({
  open,
  initialName,
  syncPhase,
  syncError,
  onSync,
  onCancel,
}) {
  const [name, setName] = useState(initialName ?? "");

  if (!open) return null;

  const submitting = syncPhase === "syncing";
  const canSubmit = name.trim().length > 0 && !submitting;

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSync(name);
  }

  return createPortal(
    <div className={styles.backdrop} onClick={submitting ? undefined : onCancel}>
      <form
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <p className={styles.message}>
          Pick a name for the leaderboard. Names aren't unique or verified — anyone can use one,
          including yours.
        </p>
        <input
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          placeholder="Your name"
          autoFocus
          disabled={submitting}
        />
        {syncError && <p className={styles.error}>{syncError}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button type="submit" className={styles.confirmBtn} disabled={!canSubmit}>
            {submitting ? "Syncing…" : "Sync to leaderboard"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
