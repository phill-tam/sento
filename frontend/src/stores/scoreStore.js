/**
 * localStorage-backed history of completed quiz runs (epic 014).
 *
 * Every run this app has ever produced was thrown away until now:
 * `useQuiz` counted into a `useState`, `QuizSummary` rendered the total
 * once, and Finish cleared it. This is where a run goes instead.
 *
 * Sits at src/ root beside sentenceStore.js rather than under utils/,
 * because it is a store boundary and not a helper. Unlike that module it
 * is **one file, not a seam** — there is no remote arm and no branch
 * waiting for one. Epic 013's lesson stands: a branch whose second half
 * nothing can reach is untested by construction. Epic 015 submits these
 * records to a leaderboard, but it submits them from here; it does not
 * turn this into a two-implementation switch.
 *
 * Synchronous, unlike localSentenceStore's eight functions. Those are
 * async because they stand in for api.js calls field-for-field. Nothing
 * on the server ever held a score, so there is no signature to mirror and
 * no reason to make every caller await a `getItem`.
 */

const SCORES_KEY = "sento:scores";
const ENVELOPE_VERSION = 1;

/**
 * Retention cap. A record is ~150 bytes against a ~5 MB budget, so this
 * is hygiene rather than capacity — an append-only list with no ceiling
 * is a slow leak whether or not it ever becomes a large one. Nothing
 * depends on the number and the envelope is versioned, so it can move
 * without a migration.
 */
const MAX_RUNS = 200;

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

/**
 * Moves an unreadable value aside instead of discarding it.
 *
 * Same treatment localSentenceStore gives its keys, and for a sharper
 * reason than "be careful". This store rewrites the whole key on every
 * write, so the obvious reader — `if (v !== 1) return []` — is not a read
 * at all: it is the first half of a delete, and the next completed quiz
 * is the second. Renaming keeps the bytes recoverable by hand while the
 * app carries on empty.
 *
 * Deliberately does not track what it quarantined. localSentenceStore
 * keeps a list because StorageNotices renders it; there is no equivalent
 * surface here yet, and a list nothing reads is the same unreachable arm
 * this module already declined to build. v1 adds both together.
 *
 * Never throws. A failure to quarantine must not also fail the read.
 */
function quarantine(raw) {
  try {
    window.localStorage.setItem(`${SCORES_KEY}:quarantine:${Date.now()}`, raw);
    window.localStorage.removeItem(SCORES_KEY);
  } catch {
    // Out of space, or storage vanished mid-session. The original key is
    // left exactly as it was — worse than quarantined, but not deleted.
  }
}

function readEnvelope() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(SCORES_KEY);
  } catch {
    // Private browsing, or a blocked-storage setting. There is no
    // availability probe in this module the way there is in
    // localSentenceStore: that one exists to *report* unavailability to
    // the user, and this one has nothing to report it to yet.
    return [];
  }

  if (raw === null) return [];

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    quarantine(raw);
    return [];
  }

  if (parsed?.v !== ENVELOPE_VERSION || !Array.isArray(parsed.items)) {
    quarantine(raw);
    return [];
  }

  return parsed.items;
}

/**
 * Returns false rather than throwing when the write fails.
 *
 * The deliberate divergence from localSentenceStore, which throws for the
 * same failure. A saved sentence is the artifact of the user's work and
 * the browser holds the only copy, so a save that silently evaporates is
 * that feature's worst failure. A score is bookkeeping *about* an
 * activity that already happened — the studying is not lost, only the
 * note of it — and interrupting a just-finished quiz with a storage
 * dialog costs more than the row.
 *
 * MVP-level, and labelled so on purpose. v1 reports unavailable storage
 * on the Progress surface the way StorageNotices.jsx already does for the
 * generator; until then the accepted failure mode is a permanently empty
 * stats page with no explanation. An explicit leaderboard submit (epic
 * 015) must NOT inherit this — the user asked for that one and is waiting
 * on the result.
 */
function writeEnvelope(items) {
  try {
    window.localStorage.setItem(
      SCORES_KEY,
      JSON.stringify({ v: ENVELOPE_VERSION, items })
    );
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Runs
 * ------------------------------------------------------------------ */

/**
 * Every completed run, newest first.
 */
export function readRuns() {
  return readEnvelope();
}

/**
 * Appends one completed run and returns the stored record, or null if the
 * write failed.
 *
 * The record is built here rather than accepted wholesale, so `id` and
 * `completedAt` cannot be forgotten by a caller and the shape cannot
 * drift between the two runners that call it.
 *
 * `total` is **the denominator that was shown to the learner** — not the
 * length of the run. For a choice quiz those are the same thing. For word
 * pairs they are not: PairQuizSummary scores out of `gradedCount`,
 * because a run where the provider dropped two pairs must not present as
 * "4 of 6, you got two wrong" when those two were never marked. Passing
 * the pair count here would recompute exactly the lie that component was
 * written to refuse, one screen further along. `skippedCount` and
 * `ungradedCount` carry the rest of the arithmetic so the gap stays
 * visible instead of being silently absorbed.
 */
export function recordRun({
  quizType,
  score,
  total,
  skippedCount = 0,
  ungradedCount = 0,
  lines = [],
}) {
  const record = {
    id: crypto.randomUUID(),
    completedAt: new Date().toISOString(),
    quizType,
    score,
    total,
    skippedCount,
    ungradedCount,
    lines,
  };

  // Newest first, then truncate — the cap drops the oldest runs, which is
  // the only end a retention limit can sensibly cut from.
  const items = [record, ...readEnvelope()].slice(0, MAX_RUNS);

  return writeEnvelope(items) ? record : null;
}

export function clearRuns() {
  try {
    window.localStorage.removeItem(SCORES_KEY);
  } catch {
    // Same reasoning as a failed write: nothing to tell the user that is
    // worth interrupting them for.
  }
}

/* ------------------------------------------------------------------ *
 * Derived stats
 * ------------------------------------------------------------------ */

/**
 * Runs with `total === 0` are counted but never averaged.
 *
 * A word-pairs run the provider failed to grade at all is a real event —
 * it happened, it cost the learner time, and hiding it would make the run
 * count disagree with the list on screen. But it has no accuracy to
 * contribute, and folding a 0/0 into an average either divides by zero or
 * silently drags the mean toward zero depending on how it is written.
 * PairQuizSummary already refuses to render a score for one of these,
 * saying "Nothing was graded this run"; this is the same rule applied to
 * the aggregate.
 */
function summarise(runs) {
  const graded = runs.filter((run) => run.total > 0);
  const score = graded.reduce((sum, run) => sum + run.score, 0);
  const total = graded.reduce((sum, run) => sum + run.total, 0);

  return {
    runs: runs.length,
    gradedRuns: graded.length,
    score,
    total,
    // null, not 0 — "no runs yet" and "every answer wrong" are different
    // states and the Progress view renders them differently.
    accuracy: total > 0 ? score / total : null,
  };
}

/**
 * Totals derived from the stored runs on every call. Nothing here is
 * persisted: a stored counter and a stored list can disagree, and then
 * there are two truths and no way to tell which one is stale.
 */
export function readStats() {
  const runs = readRuns();

  const graded = runs.filter((run) => run.total > 0);
  const best = graded.reduce((leader, run) => {
    if (!leader) return run;
    const a = run.score / run.total;
    const b = leader.score / leader.total;
    // Ties go to the longer run: 20/20 is a better result than 4/4, and
    // whichever is stored first should not decide it.
    if (a > b) return run;
    if (a === b && run.total > leader.total) return run;
    return leader;
  }, null);

  return {
    overall: summarise(runs),
    byType: {
      choice: summarise(runs.filter((run) => run.quizType === "choice")),
      pairs: summarise(runs.filter((run) => run.quizType === "pairs")),
    },
    best,
  };
}
