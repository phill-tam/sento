import { useBacksound } from '../../context/BacksoundContext';
import styles from '../../styles/SoundToggle.module.css';

export default function SoundToggle() {
  const { isMuted, toggleMute } = useBacksound();

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleMute}
      aria-pressed={!isMuted}
      aria-label={isMuted ? 'Unmute background sound' : 'Mute background sound'}
      title={isMuted ? 'Unmute background sound' : 'Mute background sound'}
    >
      {isMuted ? '🔇' : '🔊'}
    </button>
  );
}