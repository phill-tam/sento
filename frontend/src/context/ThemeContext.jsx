import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'sento:theme';

// Three values, not a boolean. "system" is a real preference — it means
// "keep following the OS" — and is distinct from having picked light on a
// machine that happens to be in light mode right now. Collapsing it to a
// boolean would silently freeze the choice at whatever the OS said the
// first time the app was opened.
const PREFERENCES = ['light', 'dark', 'system'];
const DEFAULT_PREFERENCE = 'system';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const ThemeContext = createContext(null);

function readStoredPreference() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return PREFERENCES.includes(raw) ? raw : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function prefersDark() {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * Theme preference, persisted, resolved, and stamped onto <html> as
 * data-theme for tokens.css to key off (ADR 013 / ADR 014).
 *
 * Follows the same plain-localStorage shape as the sound contexts and
 * useMastered — prefixed key, lazy initializer, write-back in an effect,
 * every access try/catch guarded so private browsing degrades silently
 * rather than throwing. No store library, no settings service.
 *
 * Mounted in main.jsx rather than App.jsx: this writes to
 * document.documentElement, so it sits at the same level as the global
 * stylesheet import rather than inside the app's view state.
 */
export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const [systemIsDark, setSystemIsDark] = useState(prefersDark);

  // Only meaningful while the preference is "system", but the listener is
  // kept attached regardless: the OS can change theme while an explicit
  // preference is set, and switching back to "system" afterwards must
  // resolve against the current value, not a stale one from mount.
  useEffect(() => {
    let mql;
    try {
      mql = window.matchMedia(DARK_QUERY);
    } catch {
      return undefined;
    }
    const onChange = (event) => setSystemIsDark(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference;

  // The resolved value goes on the element, never the preference — CSS
  // has no way to evaluate "system", and the inline script in index.html
  // stamps the same resolved value before this ever runs.
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [preference]);

  const setPreference = useCallback((next) => {
    setPreferenceState(PREFERENCES.includes(next) ? next : DEFAULT_PREFERENCE);
  }, []);

  // For the binary switch on the landing gate: flip to whichever theme is
  // not showing. Deliberately lands on an explicit light/dark and drops
  // "system" — the user just made a direct choice about what they can see.
  const toggleTheme = useCallback(() => {
    setPreferenceState(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme]);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference, toggleTheme }),
    [preference, resolvedTheme, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
