import { useEffect, useState } from "react";

/**
 * Subscribes to a CSS media query and re-renders when it flips.
 *
 * epic 011 — the app's layout is otherwise entirely CSS, and this hook
 * exists for the two things CSS genuinely cannot decide:
 *
 *   1. Which slot the search box is RENDERED in. Below the breakpoint it
 *      belongs to the top bar, above it belongs to the sidebar. CSS
 *      could only do that by rendering it twice and hiding one, which
 *      would put two identical search fields in the accessibility tree.
 *   2. Whether the sidebar's collapsed state means "closed drawer"
 *      (narrow, and the default) or "hidden desktop sidebar".
 *
 * Everything else about the responsive shell lives in the one media
 * query in AppShell.module.css. Keep it that way — this is not a general
 * licence to branch layout in JS.
 *
 * The query string is duplicated between here and the stylesheet, with
 * no build step that could share it. Callers must keep the two in sync;
 * see NARROW_LAYOUT_QUERY in App.jsx.
 *
 * Guarded the same way the localStorage preferences are, so a host
 * without matchMedia degrades to "no match" (the desktop layout) rather
 * than throwing.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mql;
    try {
      mql = window.matchMedia(query);
    } catch {
      return undefined;
    }
    // Re-read on subscribe: the query can have flipped between the lazy
    // initializer and this effect.
    setMatches(mql.matches);
    const onChange = (e) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
