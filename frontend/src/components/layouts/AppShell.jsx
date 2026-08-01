import styles from "../../styles/AppShell.module.css";

/**
 * Structural shell: fixed decorative backdrop + sticky sidebar rail + main panel.
 * Purely layout — no knowledge of what's rendered in either slot.
 */
export default function AppShell({ sidebar, children }) {
  return (
    <>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.shell}>
        <aside className={styles.lineRail}>{sidebar}</aside>
        <main className={styles.platform}>{children}</main>
      </div>
    </>
  );
}