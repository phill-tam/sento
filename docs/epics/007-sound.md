# Epic 007 — Sound: Background Music & Card Flip Effects

**Status:** Complete
**Repo:** sento
**Scope:** Frontend (React/Vite) only
**Issue:** [#90](https://github.com/phill-tam/sento/issues/90)

---

## 1. Problem Statement

Every screen up to this point was silent. This epic adds two kinds of
sound — a looping ambient background track and short tactile effects on
flashcard flip — as independently controllable systems, on top of the
app shell and design tokens epic 001 established. The original
checklist was four items (global backsound activated by a start button,
an on/off toggle, card flip effects, a volume bar), but the shipped
scope grew past that: a landing gate to satisfy the browser autoplay
policy, a rewrite of the flip-effect playback path to remove an audible
crackle, a generic `ToggleSwitch` extracted out of the original
sound-only toggle, and a settings popover hung off the icon rail. No
ADRs were written for this epic; the reasoning lives in `CLAUDE.md` and
in code comments in `FlashcardCard.jsx` and `CardSoundContext.jsx`.

This epic shipped with no feature flag — sound is unconditionally on,
the same as every other epic once its flag was later removed (see
`docs/adr/012-feature-flags-removed-admin-write-gate.md`).

---

## 2. Architecture Overview

**Two independent systems, on purpose.** Background music
(`context/BacksoundContext.jsx`) and card flip effects
(`utils/cardSoundEffects.js` + `context/CardSoundContext.jsx`) keep
fully separate mute state, separate volume, and separate `localStorage`
keys. Muting one must never silence the other. `CardSoundContext.jsx`'s
docblock and a comment in `FlashcardCard.jsx`'s `handleFlip` both call
this out explicitly as the "epic 007" rule — don't merge the two into
one sound context.

**`StartGate` exists to satisfy the browser autoplay policy.**
Chromium and other browsers refuse to play audio that wasn't initiated
by a real user gesture. `BacksoundContext`'s `start()` calls
`audioRef.current.play()` and is only ever invoked from
`StartGate.jsx`'s `handleBegin`, itself a `<button onClick>` handler —
a genuine click, not an effect. `StartGate` stays mounted permanently
(it never unmounts once dismissed); `hasStarted` toggles a CSS class
instead, so its own fade-out can be timed against `AppShell`'s slide-up
rather than the overlay vanishing abruptly. `AppShell` gained a
`contentHidden` prop for this coordinated reveal. If `play()` rejects
(autoplay still blocked), `BacksoundContext` swallows the rejection
silently and leaves `hasStarted` false — the next user gesture that
calls `start()` again is expected to succeed.

**Card effects use a module-level Web Audio context with a
decoded-buffer cache, not `new Audio(src)` per flip.**
`utils/cardSoundEffects.js` holds one lazily-created `AudioContext`
(`getContext`) and fetches + decodes each of the two WAV assets
(`card-open.wav`, `card-close.wav`) exactly once, caching the decode as
a shared promise (`openBufferPromise` / `closeBufferPromise`) so every
subsequent flip reuses the already-decoded `AudioBuffer` instead of
re-fetching and re-decoding. This replaced an earlier `new
Audio(src)`-per-flip approach whose per-play decode latency was the
likely source of an audible crackle. Both buffers are prefetched at
module load (`getOpenBuffer()` / `getCloseBuffer()` called
unconditionally at the bottom of the file) so the very first flip in a
session doesn't pay that cost inline. Playback (`playBuffer`) creates a
fresh `BufferSourceNode` + `GainNode` per play, resumes the context if
it was suspended (browsers also suspend a freshly-created
`AudioContext` until a user gesture), and connects
`source → gain → destination`.

**The settings popover needed the icon rail's z-index raised, and the
reason is specific to `position: sticky`.** `SettingsButton.jsx` pins a
gear button to the bottom of `IconRail` and opens an anchored popover
(`SettingsPanel`) on click, closed on outside click or Escape. Both
`.rail` and the sidebar's `.lineRail` are `position: sticky`, and
`sticky` creates a stacking context *unconditionally* — unlike
`relative`/`absolute`, which only do so when paired with a non-`auto`
`z-index`. That means the popover cannot escape `.rail`'s stacking
context by raising its own `z-index`; `.rail` itself has to outrank its
sibling `.lineRail`, which is why `IconRail.module.css` sets `.rail {
z-index: 2 }` against `.lineRail`'s `1`. This fix, made in this epic,
is the origin of a constraint later epics (011, 017) build on rather
than revisit.

**A generic `ToggleSwitch` was extracted rather than left specific to
sound.** The original on/off control (`SoundToggle`) had track/knob
markup that was already generic, so it became
`components/common/ToggleSwitch.jsx` — a fully controlled
label/checked/onChange component with an `orientation` prop
(`horizontal` | `vertical`). It is reused twice in this epic (once per
row in the settings panel) and later by `StartGate`'s theme switch
(epic 008), which is why the prop already supports a vertical
orientation before that consumer existed.

**Volume sliders are scaled sliders, not raw 0..1 controls.** Each
context exports a `MAX_VOLUME` constant used as the slider's `max`
(`SettingsPanel.jsx`'s `SoundRow`: `min={0} max={maxVolume}
step={maxVolume / 20}`), and the displayed percentage is computed as
`volume / maxVolume`, not `volume / 1`. Full-right on the slider is
therefore the level the app shipped with, not an arbitrary ceiling —
see Decisions below.

---

## 3. Data Model

None. Pure frontend.

---

## 4. API Surface

None. Pure frontend.

---

## 5. Frontend Components

| Component / Module | Purpose |
|---|---|
| `context/BacksoundContext.jsx` | Looped `Audio` element for background music; `backsound:muted` / `backsound:volume` in `localStorage`; exposes `start()`, `isMuted`, `toggleMute`, `volume`, `setVolume`, `maxVolume` (`MAX_VOLUME = 0.1`), `hasStarted` |
| `context/CardSoundContext.jsx` | Mute/volume state for card flip effects; `cardsound:muted` / `cardsound:volume`; mirrors state into `cardSoundEffects.js` via `setCardEffectVolume`; `maxVolume` = `MAX_VOLUME = 0.5` |
| `context/SoundProviders.jsx` | Composes `BacksoundProvider` + `CardSoundProvider` into one wrapper so `App.jsx` mounts a single provider |
| `utils/cardSoundEffects.js` | Module-level Web Audio context, decoded-buffer cache for `card-open.wav` / `card-close.wav`, prefetched at import; exports `playCardOpenSound`, `playCardCloseSound`, `setCardEffectVolume` |
| `components/common/StartGate.jsx` | Full-viewport landing overlay; its Start button calls `useBacksound().start()` inside a real click handler to satisfy autoplay policy, then `onStart` |
| `components/common/ToggleSwitch.jsx` | Generic controlled on/off switch, extracted from the original sound-only toggle; `orientation` prop (`horizontal` default, `vertical`) |
| `components/common/SettingsPanel.jsx` | Gear popover contents; one `SoundRow` per sound system (switch + scaled volume slider + percentage readout); shipped in this epic as `SoundSettingsPanel` (see Later Changes) |
| `components/layouts/SettingsButton.jsx` | Gear button pinned to the bottom of the icon rail; opens/closes the anchored popover, closes on outside click or Escape |
| `components/study/FlashcardCard.jsx` | Calls `playCardOpenSound()` / `playCardCloseSound()` from `handleFlip`, gated only by `CardSoundContext`'s own mute/volume |
| `styles/IconRail.module.css` | `.rail { z-index: 2 }`, raised in this epic so the settings popover isn't trapped behind `.lineRail`'s own sticky stacking context |

---

## 6. Decisions

No standalone ADRs were written for this epic; the two rules below are
recorded as comments in the code itself and restated in `CLAUDE.md`'s
"Sound is two independent systems, on purpose" section.

- **The two sound systems are independent, not shades of one "sound"
  concept.** Separate mute state, separate volume, separate storage
  keys, separate providers. Muting the background music must never
  silence card flips, and vice versa. Don't merge `BacksoundContext`
  and `CardSoundContext` into a single context even though their shapes
  are nearly identical — the duplication is the point.
- **`MAX_VOLUME` is a ceiling, not just a default.** `BacksoundContext`
  ships `0.1` (lowered from an earlier, louder default after it drowned
  out everything else), `CardSoundContext` ships `0.5`. Both are used
  directly as the settings slider's `max`, so full-right on either
  slider reproduces exactly the level the app shipped with, and the
  percentage readout means "share of normal volume," not "share of
  possible volume." The two values were tuned by ear against each
  other; raising either is a mix decision, not a UI change, and should
  not be done casually.
- **Web Audio with a decoded-buffer cache over `new Audio()` per
  play**, specifically to eliminate a crackle traced to per-play decode
  latency. Buffers are fetched and decoded once, cached as shared
  promises, and prefetched at module load rather than on first flip.

---

## 7. Later Changes

- **Epic 008 (Theming)** folded this epic's `SoundSettingsPanel` into a
  general `SettingsPanel` once a Theme section moved in beside Sound —
  the component was renamed and repurposed rather than duplicated; a
  Romaji row (a later epic) and epic 008's own Theme row now share the
  same popover. See `docs/epics/008-theming.md` for that epic's own
  write-up; this document does not re-describe it.
- **`StartGate`** also gained the day/night `ToggleSwitch` in epic 008,
  which is why `StartGate.jsx`'s docblock already references "epic
  008" alongside its epic 007 origin.
- **`IconRail`'s `.rail { z-index: 2 }` fix from this epic** became load
  -bearing for later navigation work (epic 002's two-tier rail, epic
  011's responsive drawer) rather than being revisited — see the
  corresponding notes in `docs/adr/017-responsive-shell-breakpoint-and-drawer.md`
  and the `IconRail.module.css` comments it left behind.

---

## 8. Open Questions

These are the known-open items carried in the issue, not treated as
blocking:

- **No `prefers-reduced-motion` or autoplay opt-out beyond the mute
  toggle.** A first-time visitor gets music starting on their first
  click (`StartGate`'s Start button), and can only silence it
  afterward via the settings gear or `StartGate` itself has no
  pre-start mute control.
- **`BacksoundContext`'s mount effect reads `volume` but has `[]` as
  its dependency array** (the `// eslint-disable-next-line
  react-hooks/exhaustive-deps` above it). Correct in practice — the
  separate volume-sync effect immediately after it re-applies the
  current value to the newly created `Audio` element — but it is a
  lint-suppressed stale-closure read that would misbehave if the
  ordering of the two effects ever changed.
- **`playBuffer` in `cardSoundEffects.js` swallows every error
  silently**, including `decodeAudioData` failures, not just the
  "no user gesture yet" case it was written for. A missing or corrupt
  audio asset is currently indistinguishable from a blocked autoplay
  context — both simply produce no sound with no console signal.

The issue also documents that this epic was originally tracked under a
placeholder number, "epic 90," before being renumbered to 007 (its
true chronological position, after the global quiz epic 006). Source
comments referencing the old number (`FlashcardCard.jsx`,
`CardSoundContext.jsx`) have already been updated to say "epic 007" —
confirmed by grepping `frontend/src` for both strings, which turns up
`epic 007` in `FlashcardCard.jsx`, `CardSoundContext.jsx`, and
`components/generator/SentenceListItem.jsx`, and no remaining `epic 90`
references. No cleanup is needed here; noted only so the renumbering
itself isn't a surprise if it's mentioned elsewhere (issue history,
old PR titles).
