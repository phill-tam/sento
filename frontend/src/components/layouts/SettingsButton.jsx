import { useEffect, useRef, useState } from "react";
import SettingsPanel from "../common/SettingsPanel";
import styles from "../../styles/SettingsButton.module.css";

/**
 * Gear button pinned to the bottom of the icon rail, opening an anchored
 * settings popover.
 *
 * Owns its own open state, unlike the rail's view buttons which are
 * fully controlled — this is purely local UI visibility, and nothing
 * above it needs to know or guard on it.
 */
export default function SettingsButton() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.railBtn} ${open ? styles.active : ""}`}
        title="Settings"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={styles.icon} aria-hidden="true">
          ⚙
        </span>
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Settings">
          <SettingsPanel />
        </div>
      )}
    </div>
  );
}
