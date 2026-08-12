import { useEffect, useRef } from "react";
import styles from "../../styles/AppShell.module.css";

/**
 * Structural shell: fixed decorative backdrop + optional icon rail +
 * sticky content sidebar + main panel. Purely layout — no knowledge of
 * what's rendered in any slot.
 *
 * rail: optional (epic 002's IconRail). Omitted entirely in contexts
 * that don't need top-level view switching — existing callers passing
 * only sidebar/children are unaffected.
 * sidebarCollapsed: collapses the content sidebar's width to zero rather
 * than unmounting it, so the collapse animates (epic 002).
 *
 * onDismissSidebar: optional (epic 011). Passing it is how a caller says
 * "the sidebar is an overlay drawer right now" — i.e. we are below the
 * breakpoint. When present the shell renders a scrim, an in-drawer close
 * control, and treats the open drawer as a modal surface. When absent
 * (desktop) every one of those is inert and the DOM is what it was
 * before this epic, minus two elements that are display:none.
 *
 * Note that AppShell still knows nothing about what fills its slots
 * (ADR 002) — `sidebar` remains ONE opaque node, deliberately not split
 * into brand/search/body. It only knows about the drawer it owns.
 */
export default function AppShell({
  rail,
  sidebar,
  sidebarCollapsed = false,
  onDismissSidebar,
  contentHidden = false,
  children,
}) {
  const closeRef = useRef(null);
  const restoreRef = useRef(null);

  // Held in a ref so the effect below depends only on the open/closed
  // transition. Callers pass an inline arrow, so depending on the
  // callback itself would re-run this every render and re-steal focus.
  const dismissRef = useRef(onDismissSidebar);
  dismissRef.current = onDismissSidebar;

  const isDrawer = Boolean(onDismissSidebar);
  const drawerOpen = isDrawer && !sidebarCollapsed;

  useEffect(() => {
    if (!drawerOpen) return undefined;

    restoreRef.current = document.activeElement;
    closeRef.current?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") dismissRef.current?.();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Send focus back where it came from — normally the top bar's
      // menu trigger, which is also what closed the drawer.
      const previous = restoreRef.current;
      if (previous && document.body.contains(previous)) previous.focus();
    };
  }, [drawerOpen]);

  return (
    <>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={`${styles.shell} ${contentHidden ? styles.contentHidden : ""}`}>
        {/* First child so that the drawer, which shares its z-index but
            comes later in the DOM, paints above it. Covers .platform
            only — the top bar outranks both. */}
        <div
          className={`${styles.scrim} ${sidebarCollapsed ? styles.scrimHidden : ""}`}
          onClick={onDismissSidebar}
          aria-hidden="true"
        />
        {rail}
        <aside
          className={`${styles.lineRail} ${sidebarCollapsed ? styles.collapsed : ""}`}
        >
          <button
            type="button"
            ref={closeRef}
            className={styles.drawerClose}
            onClick={onDismissSidebar}
            aria-label="Close navigation"
            tabIndex={drawerOpen ? 0 : -1}
          >
            <span aria-hidden="true">←</span>
          </button>
          {sidebar}
        </aside>
        {/* inert rather than a hand-rolled focus trap: it takes the
            content out of the tab order, out of hit-testing and out of
            the accessibility tree in one attribute, which is what makes
            the open drawer genuinely modal. Deliberately NOT applied to
            the rail — the top bar stays above the drawer precisely so
            its trigger, search and settings gear remain reachable while
            the drawer is open. */}
        <main className={styles.platform} inert={drawerOpen}>
          {children}
        </main>
      </div>
    </>
  );
}
