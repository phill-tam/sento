import { ApiError } from "../errors";

/**
 * localStorage implementation of the saved-sentence store (epic 013).
 *
 * Mirrors the eight persistence functions in api.js field-for-field and
 * error-for-error, so callers cannot tell which one they are talking to.
 * Records keep the server's field names (jp_text, folder_id,
 * source_item_refs, …) rather than being camelCased — that is what keeps
 * SentenceListItem, SentenceFolderTree and useQuiz's sentence branch
 * unchanged, and what makes the future login import a straight POST of
 * what is already on disk.
 *
 * Every function is async despite touching nothing asynchronous. The
 * callers await them, and the remote implementation they stand in for
 * really is async.
 */

const FOLDERS_KEY = "sento:folders";
const SENTENCES_PREFIX = "sento:sentences:";

// folder_id is nullable and null is a permanent valid state (Uncategorized,
// not "no folder chosen yet"), but null cannot be a key segment. This is a
// literal key, not a magic folder — nothing ever creates a SentenceFolder
// row for it.
const UNCATEGORIZED = "uncategorized";

const ENVELOPE_VERSION = 1;

function sentencesKey(folderId) {
  return `${SENTENCES_PREFIX}${folderId ?? UNCATEGORIZED}`;
}

/* ------------------------------------------------------------------ *
 * Storage health
 * ------------------------------------------------------------------ */

// Both are module-level rather than per-call: availability cannot change
// within a session, and the quarantine list is what the generator's notice
// slot renders (phase 3). Read them through getStorageStatus().
let storageAvailable = null;
const quarantinedKeys = [];

function isStorageAvailable() {
  if (storageAvailable !== null) return storageAvailable;

  try {
    const probe = "sento:__probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    storageAvailable = true;
  } catch {
    // Private browsing, a blocked-storage setting, or a full disk. The
    // preference convention elsewhere in this codebase swallows this and
    // moves on, which is right for a muted-volume flag and wrong here:
    // this is the only copy of the user's sentences. The caller surfaces
    // it (see getStorageStatus) instead of pretending the save worked.
    storageAvailable = false;
  }

  return storageAvailable;
}

/**
 * Storage state for the generator's notice slot. `available: false` is an
 * error state — saves will not persist. `quarantined` being non-empty is a
 * recoverable state — data was moved aside, not lost.
 */
export function getStorageStatus() {
  return {
    available: isStorageAvailable(),
    quarantined: [...quarantinedKeys],
  };
}

/**
 * Moves an unreadable value aside instead of discarding it.
 *
 * The obvious reader for a versioned envelope is `if (v !== 1) return []`,
 * and it is a trap: it destroys the user's whole library at exactly the
 * moment something has already gone unexpectedly wrong — a bad migration,
 * a half-written value, a bug in this file. Renaming the key keeps the
 * bytes on disk and recoverable by hand while the app carries on empty.
 *
 * Never throws. A failure to quarantine must not also fail the read.
 */
function quarantine(key, raw) {
  try {
    window.localStorage.setItem(`${key}:quarantine:${Date.now()}`, raw);
    window.localStorage.removeItem(key);
    quarantinedKeys.push(key);
  } catch {
    // Out of space, or storage vanished mid-session. The original key is
    // left exactly as it was — worse than quarantined, but not worse than
    // deleted.
  }
}

function readEnvelope(key) {
  if (!isStorageAvailable()) return [];

  let raw = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return [];
  }

  if (raw === null) return [];

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    quarantine(key, raw);
    return [];
  }

  if (parsed?.v !== ENVELOPE_VERSION || !Array.isArray(parsed.items)) {
    quarantine(key, raw);
    return [];
  }

  return parsed.items;
}

function writeEnvelope(key, items) {
  if (!isStorageAvailable()) {
    throw new ApiError("Browser storage is unavailable — nothing was saved.", { status: 507 });
  }

  try {
    window.localStorage.setItem(key, JSON.stringify({ v: ENVELOPE_VERSION, items }));
  } catch (err) {
    // Surfaced, never swallowed. A save that silently evaporates is the
    // worst failure this feature has.
    throw new ApiError(`Could not save to browser storage: ${err.name}`, { status: 507 });
  }
}

function removeKey(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do — a key we failed to remove is an orphan, which
    // readEnvelope treats as recoverable rather than fatal.
  }
}

/* ------------------------------------------------------------------ *
 * Folders
 * ------------------------------------------------------------------ */

export async function getSentenceFolders() {
  return readEnvelope(FOLDERS_KEY);
}

export async function createSentenceFolder(name) {
  const folders = readEnvelope(FOLDERS_KEY);
  const folder = {
    id: crypto.randomUUID(),
    name,
    created_at: new Date().toISOString(),
  };
  writeEnvelope(FOLDERS_KEY, [...folders, folder]);
  return folder;
}

export async function renameSentenceFolder(folderId, name) {
  const folders = readEnvelope(FOLDERS_KEY);
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) throw notFound("sentence folder not found");

  const renamed = { ...folder, name };
  writeEnvelope(
    FOLDERS_KEY,
    folders.map((f) => (f.id === folderId ? renamed : f))
  );
  return renamed;
}

export async function deleteSentenceFolder(folderId) {
  const folders = readEnvelope(FOLDERS_KEY);
  if (!folders.some((f) => f.id === folderId)) throw notFound("sentence folder not found");

  // The same hard block the server enforces (routes/sentence_folders.py) —
  // no override, no cascade. Duplicated deliberately; the server-side copy
  // is not dead code, it is the backstop for whenever persistence is
  // mounted again.
  if (readEnvelope(sentencesKey(folderId)).length > 0) {
    throw new ApiError("folder is not empty", { status: 409 });
  }

  writeEnvelope(
    FOLDERS_KEY,
    folders.filter((f) => f.id !== folderId)
  );
  // An empty folder still has a key once anything has ever been saved into
  // it. Leaving it behind orphans it the moment the folder is gone.
  removeKey(sentencesKey(folderId));
  return null;
}

/* ------------------------------------------------------------------ *
 * Sentences
 * ------------------------------------------------------------------ */

export async function getSentences(options) {
  const folderId = options?.folderId;

  // Falsy, not `!= null`, deliberately: a null folderId means "every
  // sentence", not "the uncategorized ones". That is the server's
  // behaviour — api.js's buildSentenceListQuery drops a falsy folderId
  // from the query string, and routes/sentences.py only filters when
  // folder_id is not None — and App.jsx relies on it, passing undefined
  // for its default all-sentences view. There is no way to ask either
  // store for uncategorized alone, and nothing needs one.
  if (folderId) return readEnvelope(sentencesKey(folderId));

  // Unscoped — every saved sentence regardless of folder, for the global
  // quiz pool (App.jsx). Per-folder keying makes this the one read that
  // fans out: the folder list, then every folder's key, then
  // uncategorized.
  const folders = readEnvelope(FOLDERS_KEY);
  return [
    ...readEnvelope(sentencesKey(null)),
    ...folders.flatMap((f) => readEnvelope(sentencesKey(f.id))),
  ];
}

export async function saveSentences({ sentences, folderId }) {
  if (folderId != null) requireFolder(folderId);

  const saved = sentences.map((s) => ({
    id: crypto.randomUUID(),
    jp_text: s.jp_text,
    reading: s.reading,
    romaji: s.romaji ?? null,
    meaning_en: s.meaning_en,
    folder_id: folderId ?? null,
    source_item_refs: s.source_item_refs ?? [],
    created_at: new Date().toISOString(),
  }));

  const key = sentencesKey(folderId);
  writeEnvelope(key, [...readEnvelope(key), ...saved]);
  return { saved };
}

export async function moveSentence(sentenceId, folderId) {
  const found = locate(sentenceId);
  if (!found) throw notFound("sentence not found");
  if (folderId != null) requireFolder(folderId);

  const { sentence, folderId: sourceFolderId } = found;
  if (sourceFolderId === (folderId ?? null)) return sentence;

  const moved = { ...sentence, folder_id: folderId ?? null };
  const destinationKey = sentencesKey(folderId);
  const sourceKey = sentencesKey(sourceFolderId);

  // Destination first, source second. This is the one operation that
  // touches two keys with no transaction between them, and the order is
  // the whole safety argument: a failure between the two writes leaves a
  // visible duplicate the user can delete. The obvious order (remove,
  // then add) leaves nothing at all.
  writeEnvelope(destinationKey, [...readEnvelope(destinationKey), moved]);
  writeEnvelope(
    sourceKey,
    readEnvelope(sourceKey).filter((s) => s.id !== sentenceId)
  );

  return moved;
}

export async function deleteSentence(sentenceId) {
  const found = locate(sentenceId);
  if (!found) throw notFound("sentence not found");

  const key = sentencesKey(found.folderId);
  writeEnvelope(
    key,
    readEnvelope(key).filter((s) => s.id !== sentenceId)
  );
  return null;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function notFound(message) {
  return new ApiError(message, { status: 404 });
}

function requireFolder(folderId) {
  if (!readEnvelope(FOLDERS_KEY).some((f) => f.id === folderId)) {
    throw notFound("sentence folder not found");
  }
}

/**
 * Which folder holds a sentence. Per-folder keys mean an id alone does not
 * say where its record lives, so relocate and delete both have to look.
 * Returns `{ sentence, folderId }` with folderId null for uncategorized.
 */
function locate(sentenceId) {
  const inUncategorized = readEnvelope(sentencesKey(null)).find((s) => s.id === sentenceId);
  if (inUncategorized) return { sentence: inUncategorized, folderId: null };

  for (const folder of readEnvelope(FOLDERS_KEY)) {
    const hit = readEnvelope(sentencesKey(folder.id)).find((s) => s.id === sentenceId);
    if (hit) return { sentence: hit, folderId: folder.id };
  }

  return null;
}
