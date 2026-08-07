import styles from "../../styles/AppShell.module.css";
import SoundToggle from "../common/SoundToggle.jsx";

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
 */
export default function AppShell({ rail, sidebar, sidebarCollapsed = false,contentHidden = false, children }) {
  return (
    <>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={`${styles.shell} ${contentHidden ? styles.contentHidden : ""}`}>
        {rail}
        <aside
          className={`${styles.lineRail} ${sidebarCollapsed ? styles.collapsed : ""}`}
        >
          {sidebar}
          <div className={styles.soundToggleSlot}>
            <SoundToggle />
          </div>
        </aside>
        <main className={styles.platform}>{children}</main>
      </div>
    </>
  );
}
