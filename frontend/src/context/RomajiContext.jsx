import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'sento:romaji';

// Off by default, and that is a teaching decision rather than a UI one.
// Romaji next to kana is read *instead* of the kana — a learner who can
// see "neko" stops decoding ねこ, which is the one skill N5 study is for.
// Anyone past that stage can turn it on in one click; a beginner who
// never opts in is never quietly taught to skip the script.
const DEFAULT_VISIBLE = false;

const RomajiContext = createContext(null);

function readStoredVisible() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return DEFAULT_VISIBLE;
  }
}

/**
 * Whether romaji is shown alongside kana on cards.
 *
 * Its own key, not a merged preferences blob — same shape as
 * `sento:theme`, `backsound:muted` and `useMastered`'s
 * `sento:mastered:{lineId}`: prefixed key, lazy initializer, write-back
 * in an effect, every localStorage access try/catch guarded so private
 * browsing degrades silently rather than throwing.
 *
 * Note this gates *display* only. Romaji always feeds the search index —
 * being able to find 猫 by typing "neko" is the point of having it, and
 * hiding a match a learner explicitly searched for would be a bug, not a
 * preference. See utils/searchIndex.js.
 */
export function RomajiProvider({ children }) {
  const [isVisible, setIsVisible] = useState(readStoredVisible);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isVisible));
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [isVisible]);

  const toggleVisible = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  const value = useMemo(
    () => ({ isVisible, toggleVisible }),
    [isVisible, toggleVisible],
  );

  return <RomajiContext.Provider value={value}>{children}</RomajiContext.Provider>;
}

export function useRomaji() {
  const ctx = useContext(RomajiContext);
  if (!ctx) {
    throw new Error('useRomaji must be used within a RomajiProvider');
  }
  return ctx;
}
