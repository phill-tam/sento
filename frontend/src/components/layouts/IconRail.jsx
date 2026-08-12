import styles from "../../styles/IconRail.module.css";
import SettingsButton from "./SettingsButton";

/**
 * Narrow icon-only vertical nav rail — one button per top-level view.
 * Sits to the left of AppShell's existing content sidebar (epic 001).
 * Fully controlled: no internal view state, matching CategoryTree's
 * and ModeToggle's existing pattern of parent-owned state.
 *
 * views: [{ id, icon, label }]  — label used for title/aria only, not
 * rendered as visible text (rail is icon-only by design).
 *
 * SettingsButton is appended as a permanent last child, pinned to the
 * bottom of the rail. It is not part of `views` because it opens a
 * popover rather than switching the active view.
 *
 * epic 011 — below the breakpoint this same nav lays out as a horizontal
 * top bar (see the media query in IconRail.module.css). It is not
 * rendered a second time inside a separate mobile bar: one instance,
 * restyled, so there is no pair of synced components to drift apart.
 *
 * onToggleSidebar / search are both optional and both narrow-only. The
 * caller passes them exactly when the sidebar is an overlay drawer, so
 * above the breakpoint this renders the identical DOM it always did.
 * The drawer trigger has to exist because the sidebar stops being
 * persistently available down there, which is the part of ADR 004's
 * reasoning that stops holding once it becomes an overlay.
 */
export default function IconRail({
  views,
  activeView,
  onSelectView,
  sidebarCollapsed,
  onToggleSidebar,
  search,
}) {
  return (
    <nav className={styles.rail} aria-label="Primary navigation">
      {onToggleSidebar && (
        <button
          type="button"
          className={`${styles.railBtn} ${styles.menuBtn}`}
          title={sidebarCollapsed ? "Open navigation" : "Close navigation"}
          aria-label={sidebarCollapsed ? "Open navigation" : "Close navigation"}
          aria-expanded={!sidebarCollapsed}
          onClick={onToggleSidebar}
        >
          <span className={styles.icon} aria-hidden="true">
            ☰
          </span>
        </button>
      )}
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          className={`${styles.railBtn} ${
            activeView === view.id ? styles.active : ""
          }`}
          title={view.label}
          aria-label={view.label}
          aria-current={activeView === view.id ? "true" : undefined}
          onClick={() => onSelectView(view.id)}
        >
          <span className={styles.icon} aria-hidden="true">
            {view.icon}
          </span>
        </button>
      ))}
      {search}
      <SettingsButton />
    </nav>
  );
}
