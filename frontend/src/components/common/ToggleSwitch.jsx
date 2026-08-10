import styles from '../../styles/ToggleSwitch.module.css';

/**
 * Generic labelled on/off switch — fully controlled, no internal state,
 * matching ConfirmDialog's and CategoryTree's parent-owned-state pattern.
 *
 * Extracted from SoundToggle unchanged: the pill/track/knob markup was
 * already generic, so the sound settings panel can render one per sound
 * system instead of the styling being tied to the backsound.
 */
export default function ToggleSwitch({ label, checked, onChange, ariaLabel }) {
  const describedAs = ariaLabel ?? label;

  return (
    <button
      type="button"
      className={styles.pill}
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={describedAs}
      title={describedAs}
    >
      <span className={styles.label}>{label}</span>
      <span className={`${styles.track} ${checked ? styles.trackOn : ''}`}>
        <span className={`${styles.knob} ${checked ? styles.knobOn : ''}`} />
      </span>
    </button>
  );
}
