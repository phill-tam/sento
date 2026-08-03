import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "sento:mastered:";

function loadMastered(lineId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + lineId);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    // corrupted or non-JSON value in storage — treat as empty rather than throw
    return new Set();
  }
}

function saveMastered(lineId, set) {
  try {
    localStorage.setItem(STORAGE_PREFIX + lineId, JSON.stringify([...set]));
  } catch {
    // storage unavailable (private browsing, quota) — mastered state just
    // won't persist this session; not worth surfacing as an error to the
    // learner mid-study
  }
}

/**
 * localStorage-backed mastered-id set for one content line, namespaced
 * (sento:mastered:kanji / :vocab / :grammar) so all three lines stay
 * independent. Returns a Set for O(1) .has() lookups — studyTreeAdapter.js
 * (step 3) reads this directly when computing per-category progress.
 *
 * Call once per line in StudyPage (step 9), e.g.:
 *   const kanjiMastered = useMastered("kanji");
 */
export function useMastered(lineId) {
  const [mastered, setMastered] = useState(() => loadMastered(lineId));

  useEffect(() => {
    setMastered(loadMastered(lineId));
  }, [lineId]);

  const toggle = useCallback(
    (entryId) => {
      setMastered((prev) => {
        const next = new Set(prev);
        if (next.has(entryId)) {
          next.delete(entryId);
        } else {
          next.add(entryId);
        }
        saveMastered(lineId, next);
        return next;
      });
    },
    [lineId]
  );

  return { mastered, toggle };
}