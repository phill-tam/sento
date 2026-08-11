import styles from "../../styles/StartGate.module.css";
import { useBacksound } from '../../context/BacksoundContext';
import { useTheme } from '../../context/ThemeContext';
import ToggleSwitch from './ToggleSwitch';

/**
 * Full-viewport landing overlay shown before the app "opens". Stays
 * mounted (never unmounts) even once hidden — hasStarted toggles a CSS
 * class instead, so its own fade-out can be timed against AppShell's
 * .shell slide-up rather than vanishing abruptly. tabIndex is dropped
 * to -1 while hidden so it can't be tabbed into once inert.
 *
 * Also carries the theme switch (epic 008), which is why the theme can
 * be chosen before the app opens rather than only from the settings
 * gear afterwards. Toggling it must not start the app: it is a sibling
 * of the Start button, not a child, and nothing on the gate itself
 * listens for clicks.
 */
export default function StartGate({ hasStarted, onStart }) {
  const { start } = useBacksound();
  const { resolvedTheme, toggleTheme } = useTheme();
  const isNight = resolvedTheme === 'dark';

  const handleBegin = () => {
    start();          // kicks off the audio inside a real user gesture
    onStart?.();       // your existing logic
  };

  return (
    <div className={`${styles.gate} ${hasStarted ? styles.hidden : ""}`}>
      <div className={styles.cluster}>
        <button
          type="button"
          className={styles.startBtn}
          onClick={handleBegin}
          tabIndex={hasStarted ? -1 : 0}
        >
          Start
        </button>
        <div className={styles.themeSwitch}>
          <ToggleSwitch
            orientation="vertical"
            label={isNight ? "☾" : "☀"}
            checked={isNight}
            onChange={toggleTheme}
            ariaLabel={
              isNight ? "Switch to the day theme" : "Switch to the night theme"
            }
            tabIndex={hasStarted ? -1 : 0}
          />
        </div>
      </div>
    </div>
  );
}
