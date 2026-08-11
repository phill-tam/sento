import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'sento:theme';

// Two values, and deliberately not three. An earlier version modelled a
// "system" preference that tracked prefers-color-scheme, on the reasoning
// that persisting a resolved boolean would freeze "follow my OS" at
// whatever the OS said on first visit. That reasoning only holds while
// following the OS is the default — and it no longer is. Day is what a
// first-time visitor sees, so nobody arrives in system mode, and the
// value survived only as a state nothing could select. It is gone rather
// than left unreachable.
const THEMES = ['light', 'dark'];

// Day is what a first-time visitor sees, regardless of what their OS
// prefers. The palette in tokens.css is the day one, the hero art is the
// day scene, and every screenshot of this project is light — following
// the OS meant a dark-OS visitor met a version of the app nobody had
// chosen for them.
const DEFAULT_THEME = 'light';

const ThemeContext = createContext(null);

function readStoredTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * Theme preference, persisted and stamped onto <html> as data-theme for
 * tokens.css to key off (ADR 013 / ADR 014).
 *
 * Follows the same plain-localStorage shape as the sound contexts and
 * useMastered — prefixed key, lazy initializer, write-back in an effect,
 * every localStorage access try/catch guarded so private browsing
 * degrades silently rather than throwing. No store library.
 *
 * Mounted in main.jsx, not App.jsx: this writes to
 * document.documentElement, so it belongs at the same level as the
 * global stylesheet import rather than inside the app's view state.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(THEMES.includes(next) ? next : DEFAULT_THEME);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
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
