import { useBacksound } from '../../context/BacksoundContext';
import ToggleSwitch from './ToggleSwitch';

export default function SoundToggle() {
  const { isMuted, toggleMute } = useBacksound();
  const isOn = !isMuted;

  return (
    <ToggleSwitch
      label="Sound"
      checked={isOn}
      onChange={toggleMute}
      ariaLabel={isOn ? 'Turn sound off' : 'Turn sound on'}
    />
  );
}
