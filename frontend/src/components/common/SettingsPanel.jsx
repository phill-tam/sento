import { useBacksound } from '../../context/BacksoundContext';
import { useCardSound } from '../../context/CardSoundContext';
import { useTheme } from '../../context/ThemeContext';
import ToggleSwitch from './ToggleSwitch';
import styles from '../../styles/SettingsPanel.module.css';

/**
 * One row per independent sound system: an on/off switch plus a volume
 * bar. The bar runs from silent up to that system's own tuned default
 * (MAX_VOLUME in each context) rather than an arbitrary 0..1, so
 * full-right is the level the app shipped with and the percentage reads
 * as "share of normal volume".
 */
function SoundRow({ label, isMuted, onToggleMute, volume, maxVolume, onVolumeChange }) {
  const percent = maxVolume > 0 ? Math.round((volume / maxVolume) * 100) : 0;

  return (
    <div className={styles.row}>
      <ToggleSwitch
        label={label}
        checked={!isMuted}
        onChange={onToggleMute}
        ariaLabel={isMuted ? `Turn ${label} sound on` : `Turn ${label} sound off`}
      />
      <div className={styles.sliderRow}>
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={maxVolume}
          step={maxVolume / 20}
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          aria-label={`${label} volume`}
        />
        <span className={styles.percent}>{percent}%</span>
      </div>
    </div>
  );
}

/**
 * The gear popover's contents. Sound was the only thing in here when it
 * was SoundSettingsPanel; it is now one section among others, so the
 * panel is named for the popover rather than for its first occupant.
 */
export default function SettingsPanel() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const backsound = useBacksound();
  const cardSound = useCardSound();
  const isNight = resolvedTheme === 'dark';

  return (
    <div className={styles.panel}>
      <p className={styles.heading}>Theme</p>
      <div className={styles.row}>
        <ToggleSwitch
          label="Night"
          checked={isNight}
          onChange={toggleTheme}
          ariaLabel={
            isNight ? 'Switch to the day theme' : 'Switch to the night theme'
          }
        />
      </div>
      <p className={styles.heading}>Sound</p>
      <SoundRow
        label="Global"
        isMuted={backsound.isMuted}
        onToggleMute={backsound.toggleMute}
        volume={backsound.volume}
        maxVolume={backsound.maxVolume}
        onVolumeChange={backsound.setVolume}
      />
      <SoundRow
        label="Cards"
        isMuted={cardSound.isMuted}
        onToggleMute={cardSound.toggleMute}
        volume={cardSound.volume}
        maxVolume={cardSound.maxVolume}
        onVolumeChange={cardSound.setVolume}
      />
    </div>
  );
}
