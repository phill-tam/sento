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
 */
export default function IconRail({ views, activeView, onSelectView }) {
  return (
    <nav className={styles.rail} aria-label="Primary navigation">
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
      <SettingsButton />
    </nav>
  );
}
