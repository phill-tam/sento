/**
 * Device-scoped identity for the leaderboard (epic 015, ADR 021).
 *
 * Two plain localStorage-backed strings — sento:deviceId and
 * sento:displayName — not a shared sento:profile record. They were one
 * record in the original plan (issue #155); that stopped holding once
 * epic 016's per-device AI quota needed deviceId too, at which point the
 * two no longer shared a single "read and written together" lifecycle.
 * See CLAUDE.md's preference-key list.
 *
 * A plain module rather than a hook, unlike sento:theme / sento:romaji.
 * This codebase's usual preference shape — useState(() => read()) plus a
 * write-back effect, no store module — assumes every reader is a React
 * component. deviceId isn't: api.js reads it outside any component to
 * stamp a leaderboard submission, and epic 016 will read it again for
 * its per-device quota. Same reason scoreStore.js is a plain module
 * rather than a hook.
 *
 * Swallows on write, degrades to null/fresh-id on read — matching the
 * preference convention (sento:theme, sento:romaji, useMastered), not
 * scoreStore's or localSentenceStore's user-data convention. Neither
 * value is irreplaceable the way a saved sentence or a run history is: a
 * lost deviceId mints a new one and the leaderboard entry effectively
 * restarts, and a lost display name is retyped in seconds. Nothing here
 * justifies quarantining unreadable data or throwing on a failed write.
 */

const DEVICE_ID_KEY = "sento:deviceId";
const DISPLAY_NAME_KEY = "sento:displayName";

// A label, not an identifier — ADR 021 deliberately enforces nothing
// past "renders sanely in a list." Names are not unique or verified.
// Exported so the name-entry dialog (phase 3) can cap the input at the
// same length rather than duplicating the number.
export const MAX_DISPLAY_NAME_LENGTH = 20;

function readKey(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private browsing, or storage blocked — same as every other
    // preference in this app.
    return null;
  }
}

function writeKey(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the write silently doesn't persist, matching
    // useMastered rather than scoreStore/localSentenceStore. Neither
    // value here is the artifact of anything; both are trivially
    // recreated.
  }
}

/**
 * This browser's device id, minting and persisting one on first call if
 * none exists yet. Never returns null — every caller can treat this as
 * an unconditional read.
 */
export function getDeviceId() {
  const existing = readKey(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  writeKey(DEVICE_ID_KEY, id);
  return id;
}

/**
 * The stored display name, or null if the user has never set one.
 */
export function getDisplayName() {
  return readKey(DISPLAY_NAME_KEY);
}

/**
 * Trims and length-caps before storing, then returns the stored value.
 *
 * Throws on an empty/whitespace-only name — a distinct thing from the
 * write-swallows-on-failure rule above. That rule covers storage
 * failing; this is input validation on a deliberate user action (typing
 * a name into a dialog and confirming), and the caller is expected to
 * surface the rejection rather than have it silently no-op.
 */
export function setDisplayName(name) {
  const trimmed = name.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  if (!trimmed) {
    throw new Error("Display name cannot be empty");
  }

  writeKey(DISPLAY_NAME_KEY, trimmed);
  return trimmed;
}
