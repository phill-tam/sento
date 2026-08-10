import styles from '../../styles/ToggleSwitch.module.css';

/**
 * Generic labelled on/off switch — fully controlled, no internal state,
 * matching ConfirmDialog's and CategoryTree's parent-owned-state pattern.
 *
 * Extracted from SoundToggle unchanged: the pill/track/knob markup was
 * already generic, so the sound settings panel can render one per sound
 * system instead of the styling being tied to the backsound.
 *
 * `orientation` rotates the track's long axis; the knob then travels on
 * `top` rather than `left`. Everything else — markup, the switch role,
 * the controlled contract — is shared, which is why this is a variant
 * rather than a second component.
 *
 * `tabIndex` is a passthrough for callers that need the switch to go
 * inert without unmounting it, e.g. StartGate keeping its own fade-out
 * timing.
 */
export default function ToggleSwitch({
  label,
  checked,
  onChange,
  ariaLabel,
  orientation = 'horizontal',
  tabIndex,
}) {
  const describedAs = ariaLabel ?? label;
  const isVertical = orientation === 'vertical';
  const pillClass = isVertical ? `${styles.pill} ${styles.vertical}` : styles.pill;

  return (
    <button
      type="button"
      className={pillClass}
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={describedAs}
      title={describedAs}
      tabIndex={tabIndex}
    >
      <span className={styles.label}>{label}</span>
      <span className={`${styles.track} ${checked ? styles.trackOn : ''}`}>
        <span className={`${styles.knob} ${checked ? styles.knobOn : ''}`} />
      </span>
    </button>
  );
}
