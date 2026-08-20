import { useState } from "react";

import { clearRuns, readRuns, readStats } from "../stores/scoreStore";
import ConfirmDialog from "../components/common/ConfirmDialog";
import ProgressStats from "../components/progress/ProgressStats";
import RunList from "../components/progress/RunList";
import styles from "../styles/ProgressPage.module.css";

/**
 * Quiz history (epic 014) — the fourth top-level view.
 *
 * Storage is read once at mount rather than watched. App.jsx
 * switch-renders the views, so this component is unmounted whenever the
 * learner is anywhere else, and a run can only be recorded while a quiz
 * is active — which is to say, while this page is not mounted. There is
 * no state to subscribe to and nothing that can go stale underneath it.
 *
 * The one exception is clearing, which happens here, so that path sets
 * state explicitly.
 */
function load() {
  return { runs: readRuns(), stats: readStats() };
}

export default function ProgressPage() {
  const [{ runs, stats }, setData] = useState(load);
  const [confirmingClear, setConfirmingClear] = useState(false);

  function handleClear() {
    clearRuns();
    setData(load());
    setConfirmingClear(false);
  }

  if (runs.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No finished runs yet</p>
          <p className={styles.emptyBody}>
            Results are saved when you reach the end of a quiz or a word-pairs run.
            They stay in this browser.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Progress</h2>
        {/* The browser holds the only copy, which is the same reason a
            saved sentence cannot be deleted without confirming either. */}
        <button
          type="button"
          className={styles.clearBtn}
          onClick={() => setConfirmingClear(true)}
        >
          Clear history
        </button>
      </div>

      <ProgressStats stats={stats} />

      <h3 className={styles.subheading}>Recent runs</h3>
      <RunList runs={runs} />

      <ConfirmDialog
        open={confirmingClear}
        message={`Delete all ${runs.length} recorded runs? This browser holds the only copy.`}
        confirmLabel="Clear history"
        onConfirm={handleClear}
        onCancel={() => setConfirmingClear(false)}
      />
    </div>
  );
}
