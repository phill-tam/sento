import { useCallback, useEffect, useState } from "react";

import { fetchLeaderboard, submitLeaderboardRuns } from "../api";
import { getDeviceId, getDisplayName, setDisplayName } from "../stores/identityStore";
import { readRuns } from "../stores/scoreStore";

/**
 * Leaderboard read + sync state (epic 015).
 *
 * The board loads once on mount, unconditionally — reading it needs no
 * identity and no user action, so a learner sees where they'd land
 * before ever syncing anything.
 *
 * Syncing is a separate, explicit action (`sync`), never automatic on
 * mount or wired into either quiz runner. ADR 020 is explicit that a
 * leaderboard submission must not inherit scoreStore's silent-swallow-
 * on-write convention: the user asked for this action and is waiting on
 * it, so a failure surfaces as `syncError` rather than disappearing.
 *
 * `sync` both persists the name locally (identityStore, so the dialog
 * pre-fills next time) and sends it to the server — one action, not two
 * the caller has to sequence. Returns true/false rather than leaving
 * the caller to infer success from `syncPhase` after the await — a
 * state read immediately after an awaited setState is not guaranteed to
 * reflect it, and the dialog needs to know synchronously whether to
 * close itself or stay open on the error it just set.
 */
export function useLeaderboard() {
  const [entries, setEntries] = useState([]);
  const [boardPhase, setBoardPhase] = useState("loading"); // loading | ready | error
  const [syncPhase, setSyncPhase] = useState("idle"); // idle | syncing | error
  const [syncError, setSyncError] = useState(null);

  const loadBoard = useCallback(async () => {
    setBoardPhase("loading");
    try {
      const response = await fetchLeaderboard();
      setEntries(response.entries);
      setBoardPhase("ready");
    } catch {
      setBoardPhase("error");
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const sync = useCallback(
    async (name) => {
      setSyncPhase("syncing");
      setSyncError(null);

      try {
        // Throws on empty/whitespace-only — the dialog already disables
        // its submit button for that case, so reaching this is a
        // backstop, not the primary validation path.
        const trimmed = setDisplayName(name);

        const runs = readRuns().map((run) => ({
          id: run.id,
          quiz_type: run.quizType,
          score: run.score,
          total: run.total,
          completed_at: run.completedAt,
        }));

        await submitLeaderboardRuns({ deviceId: getDeviceId(), displayName: trimmed, runs });
        await loadBoard();
        setSyncPhase("idle");
        return true;
      } catch (err) {
        setSyncPhase("error");
        setSyncError(err.message);
        return false;
      }
    },
    [loadBoard]
  );

  return {
    entries,
    boardPhase,
    syncPhase,
    syncError,
    displayName: getDisplayName(),
    sync,
  };
}
