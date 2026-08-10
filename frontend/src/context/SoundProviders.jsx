import { BacksoundProvider } from './BacksoundContext';
import { CardSoundProvider } from './CardSoundContext';

/**
 * Composes the independent sound providers into one wrapper.
 *
 * The two contexts stay separate on purpose (background music and card
 * effects are muted independently), but App.jsx does not need to know
 * that — it just needs sound available. Composing here keeps the app's
 * already-deep JSX from gaining a nesting level per sound system.
 */
export default function SoundProviders({ children }) {
  return (
    <BacksoundProvider>
      <CardSoundProvider>{children}</CardSoundProvider>
    </BacksoundProvider>
  );
}
