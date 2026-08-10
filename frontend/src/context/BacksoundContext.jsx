import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import backsoundSrc from '../assets/backsound.mp3';

const STORAGE_KEY = 'backsound:muted';
const VOLUME_STORAGE_KEY = 'backsound:volume';
// Doubles as the ceiling of the Global volume slider: this level was
// tuned by ear against the card effects, so the settings panel scales
// *down* from it rather than letting the user push past it.
const MAX_VOLUME = 0.1;

const BacksoundContext = createContext(null);

function clampVolume(value) {
  if (!Number.isFinite(value)) return MAX_VOLUME;
  return Math.min(MAX_VOLUME, Math.max(0, value));
}

function readStoredVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return MAX_VOLUME;
    return clampVolume(parseFloat(raw));
  } catch {
    return MAX_VOLUME;
  }
}

export function BacksoundProvider({ children }) {
  const audioRef = useRef(null);
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [volume, setVolumeState] = useState(readStoredVolume);
  const [hasStarted, setHasStarted] = useState(false);

  // Create the audio element once.
  useEffect(() => {
    const audio = new Audio(backsoundSrc);
    audio.loop = true;
    audio.volume = volume;
    audio.muted = isMuted;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the element in sync with mute state.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(isMuted));
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [isMuted]);

  // Same shape as the mute effect above: sync the element, then persist.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [volume]);

  // Call this from a user gesture (click, tap) to satisfy autoplay policies.
  const start = useCallback(() => {
    if (hasStarted || !audioRef.current) return;
    audioRef.current
      .play()
      .then(() => setHasStarted(true))
      .catch(() => {
        // Autoplay was blocked; it will retry on the next user gesture.
      });
  }, [hasStarted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const setVolume = useCallback((value) => {
    setVolumeState(clampVolume(value));
  }, []);

  return (
    <BacksoundContext.Provider
      value={{
        start,
        isMuted,
        toggleMute,
        volume,
        setVolume,
        maxVolume: MAX_VOLUME,
        hasStarted,
      }}
    >
      {children}
    </BacksoundContext.Provider>
  );
}

export function useBacksound() {
  const ctx = useContext(BacksoundContext);
  if (!ctx) {
    throw new Error('useBacksound must be used within a BacksoundProvider');
  }
  return ctx;
}
