import { useBacksound } from '../../context/BacksoundContext';
import styles from '../../styles/SoundToggle.module.css';

export default function SoundToggle() {
  const { isMuted, toggleMute } = useBacksound();
  const isOn = !isMuted;

  return (
    <button
      type="button"
      className={styles.pill}
      onClick={toggleMute}
      role="switch"
      aria-checked={isOn}
      aria-label={isOn ? 'Turn sound off' : 'Turn sound on'}
      title={isOn ? 'Turn sound off' : 'Turn sound on'}
    >
      <span className={styles.label}>Sound</span>
      <span className={`${styles.track} ${isOn ? styles.trackOn : ''}`}>
        <span className={`${styles.knob} ${isOn ? styles.knobOn : ''}`} />
      </span>
    </button>
  );
}