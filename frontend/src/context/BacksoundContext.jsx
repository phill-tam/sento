import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import backsoundSrc from '../assets/backsound.mp3';

const STORAGE_KEY = 'backsound:muted';
const DEFAULT_VOLUME = 0.1;

const BacksoundContext = createContext(null);

export function BacksoundProvider({ children }) {
  const audioRef = useRef(null);
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [hasStarted, setHasStarted] = useState(false);

  // Create the audio element once.
  useEffect(() => {
    const audio = new Audio(backsoundSrc);
    audio.loop = true;
    audio.volume = DEFAULT_VOLUME;
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
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, value));
    }
  }, []);

  return (
    <BacksoundContext.Provider value={{ start, isMuted, toggleMute, setVolume, hasStarted }}>
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