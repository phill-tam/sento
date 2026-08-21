import { useState } from "react";

import { useLeaderboard } from "../hooks/useLeaderboard";
import { clearRuns, readRuns, readStats } from "../stores/scoreStore";
import ConfirmDialog from "../components/common/ConfirmDialog";
import LeaderboardList from "../components/progress/LeaderboardList";
import LeaderboardSyncDialog from "../components/progress/LeaderboardSyncDialog";
import ProgressStats from "../components/progress/ProgressStats";
import RunList from "../components/progress/RunList";
import styles from "../styles/ProgressPage.module.css";

/**
 * Quiz history (epic 014) — the fourth top-level view. Epic 015 adds the
 * leaderboard beside it.
 *
 * Storage is read once at mount rather than watched. App.jsx
 * switch-renders the views, so this component is unmounted whenever the
 * learner is anywhere else, and a run can only be recorded while a quiz
 * is active — which is to say, while this page is not mounted. There is
 * no state to subscribe to and nothing that can go stale underneath it.
 *
 * The one exception is clearing, which happens here, so that path sets
 * state explicitly.
 *
 * The local history renders BEFORE the leaderboard in the DOM even
 * though the leaderboard sits to its left on desktop. Desktop places the
 * board into grid column 1 explicitly rather than reordering the source,
 * which keeps the narrow layout's reading and tab order exactly as epic
 * 015 shipped them — main content first — instead of making a phone tab
 * through the whole board to reach the learner's own stats.
 */
function load() {
  return { runs: readRuns(), stats: readStats() };
}

export default function ProgressPage() {
  const [{ runs, stats }, setData] = useState(load);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const leaderboard = useLeaderboard();

  function handleClear() {
    clearRuns();
    setData(load());
    setConfirmingClear(false);
  }

  async function handleSync(name) {
    const ok = await leaderboard.sync(name);
    // Stays open on failure so syncError renders inside the dialog —
    // closing it would hide the message the user needs to see.
    if (ok) setSyncDialogOpen(false);
  }

  const hasRuns = runs.length > 0;

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.mainCol}>
          {hasRuns ? (
            <>
              <div className={styles.header}>
                <h2 className={styles.heading}>Progress</h2>
                {/* The browser holds the only copy, which is the same reason a
                    saved sentence cannot be deleted without confirming either. */}
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setConfirmingClear(true)}
                >
                  Clear history
                </button>
              </div>

              <ProgressStats stats={stats} />

              <h3 className={styles.subheading}>Recent runs</h3>
              <RunList runs={runs} />
            </>
          ) : (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No finished runs yet</p>
              <p className={styles.emptyBody}>
                Results are saved when you reach the end of a quiz or a word-pairs run.
                They stay in this browser.
              </p>
            </div>
          )}
        </div>

        {/* A public read with no dependency on the learner's own history,
            so it renders whether or not anything local was recorded — a
            new learner with nothing of their own can still see where the
            board stands. */}
        <aside className={styles.boardCol}>
          <div className={styles.header}>
            <h3 className={styles.subheading}>Leaderboard</h3>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setSyncDialogOpen(true)}
              disabled={!hasRuns}
              title={hasRuns ? undefined : "Finish a quiz first — there's nothing to sync yet"}
            >
              Sync to leaderboard
            </button>
          </div>

          <div className={styles.boardScroll}>
            <LeaderboardList
              entries={leaderboard.entries}
              loading={leaderboard.boardPhase === "loading"}
            />
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmingClear}
        message={`Delete all ${runs.length} recorded runs? This browser holds the only copy.`}
        confirmLabel="Clear history"
        onConfirm={handleClear}
        onCancel={() => setConfirmingClear(false)}
      />

      <LeaderboardSyncDialog
        open={syncDialogOpen}
        initialName={leaderboard.displayName}
        syncPhase={leaderboard.syncPhase}
        syncError={leaderboard.syncError}
        onSync={handleSync}
        onCancel={() => setSyncDialogOpen(false)}
      />
    </div>
  );
}
