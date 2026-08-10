import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { setCardEffectVolume } from '../utils/cardSoundEffects';

const MUTED_STORAGE_KEY = 'cardsound:muted';
const VOLUME_STORAGE_KEY = 'cardsound:volume';
// Ceiling of the Cards volume slider — the level cardSoundEffects.js
// shipped with. Same reasoning as BacksoundContext's MAX_VOLUME: the
// slider scales down from the tuned default rather than past it.
const MAX_VOLUME = 0.5;

const CardSoundContext = createContext(null);

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

/**
 * Mute + volume for the card flip effects.
 *
 * Deliberately a separate provider from BacksoundContext rather than one
 * combined sound context: the two are independent by design (see the
 * "epic 007" note in FlashcardCard), so muting the background music must
 * not silence the flip effects, and vice versa.
 *
 * Unlike the backsound this owns no audio element — cardSoundEffects.js
 * holds a module-level Web Audio context and buffer cache, so this only
 * mirrors state into it via setCardEffectVolume.
 */
export function CardSoundProvider({ children }) {
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [volume, setVolumeState] = useState(readStoredVolume);

  // One effect for both inputs: the module only takes a single gain
  // value, so mute is expressed as a volume of zero rather than a
  // separate flag it would have to combine itself.
  useEffect(() => {
    setCardEffectVolume(isMuted ? 0 : volume);
  }, [isMuted, volume]);

  useEffect(() => {
    try {
      localStorage.setItem(MUTED_STORAGE_KEY, String(isMuted));
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [isMuted]);

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [volume]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const setVolume = useCallback((value) => {
    setVolumeState(clampVolume(value));
  }, []);

  return (
    <CardSoundContext.Provider
      value={{ isMuted, toggleMute, volume, setVolume, maxVolume: MAX_VOLUME }}
    >
      {children}
    </CardSoundContext.Provider>
  );
}

export function useCardSound() {
  const ctx = useContext(CardSoundContext);
  if (!ctx) {
    throw new Error('useCardSound must be used within a CardSoundProvider');
  }
  return ctx;
}
