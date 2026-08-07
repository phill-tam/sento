import cardOpenSrc from '../assets/card-open.wav';
import cardCloseSrc from '../assets/card-close.wav';

const EFFECT_VOLUME = 0.5;

let audioContext = null;
let openBufferPromise = null;
let closeBufferPromise = null;

function getContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

// Fetch + decode each file exactly once, cached as a shared promise, so
// repeated flips reuse the same decoded buffer instead of re-fetching
// and re-decoding the file on every play (that per-play decode latency
// was the likely source of the audible crackle with new Audio(src)).
async function loadBuffer(src, cachedPromise, setCache) {
  if (cachedPromise) return cachedPromise;
  const ctx = getContext();
  const promise = fetch(src)
    .then((res) => res.arrayBuffer())
    .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer));
  setCache(promise);
  return promise;
}

function getOpenBuffer() {
  openBufferPromise = loadBuffer(cardOpenSrc, openBufferPromise, (p) => {
    openBufferPromise = p;
  });
  return openBufferPromise;
}

function getCloseBuffer() {
  closeBufferPromise = loadBuffer(cardCloseSrc, closeBufferPromise, (p) => {
    closeBufferPromise = p;
  });
  return closeBufferPromise;
}

async function playBuffer(bufferPromise) {
  try {
    const ctx = getContext();
    // Browsers suspend new AudioContexts until a user gesture; resume()
    // is a no-op if it's already running.
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const buffer = await bufferPromise;
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.value = EFFECT_VOLUME;

    source.connect(gain).connect(ctx.destination);
    source.start(0);
  } catch {
    // Ignore — e.g. decode failure or no user gesture yet.
  }
}

// Kick off decoding as soon as this module loads, so the very first
// card flip doesn't pay the fetch+decode cost inline.
getOpenBuffer();
getCloseBuffer();

export function playCardOpenSound() {
  playBuffer(getOpenBuffer());
}

export function playCardCloseSound() {
  playBuffer(getCloseBuffer());
}