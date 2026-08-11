import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'sento:romaji';

// On by default. An earlier version defaulted this off, on the argument
// that romaji beside kana gets read instead of the kana and quietly
// trains beginners out of decoding the script. That reasoning is real but
// it was overruled deliberately: a first-time visitor who can't read kana
// yet meets a wall of characters with no way in, and discovering the
// setting requires already knowing to look for it. Turning it off is one
// click for anyone who wants the harder mode.
const DEFAULT_VISIBLE = true;

const RomajiContext = createContext(null);

function readStoredVisible() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Absent key means "never chosen", which must fall through to the
    // default — comparing against 'true' directly would silently pin new
    // visitors to off regardless of what DEFAULT_VISIBLE says.
    if (raw === null) return DEFAULT_VISIBLE;
    return raw === 'true';
  } catch {
    return DEFAULT_VISIBLE;
  }
}

/**
 * Whether romaji is shown alongside kana on cards. Defaults on; see
 * DEFAULT_VISIBLE for why that was chosen over the stricter option.
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
