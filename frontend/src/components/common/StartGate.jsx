import styles from "../../styles/StartGate.module.css";
import { useBacksound } from '../../context/BacksoundContext';

/**
 * Full-viewport landing overlay shown before the app "opens". Stays
 * mounted (never unmounts) even once hidden — hasStarted toggles a CSS
 * class instead, so its own fade-out can be timed against AppShell's
 * .shell slide-up rather than vanishing abruptly. tabIndex is dropped
 * to -1 while hidden so it can't be tabbed into once inert.
 */
export default function StartGate({ hasStarted, onStart }) {
  const { start } = useBacksound();

  const handleBegin = () => {
    start();          // kicks off the audio inside a real user gesture
    onStart?.();       // your existing logic
  };  
  
  return (
    <div className={`${styles.gate} ${hasStarted ? styles.hidden : ""}`}>
      <button
        type="button"
        className={styles.startBtn}
        onClick={handleBegin}
        tabIndex={hasStarted ? -1 : 0}
      >
        Start
      </button>
    </div>
  );
}