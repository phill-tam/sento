# 020 — Score history quarantines on read but swallows on write

**Status:** Accepted
**Epic:** 014 — Scoring ([#155](https://github.com/phill-tam/sento/issues/155))
**Related:** [019 — The browser is the store of record for anonymous saved sentences](019-browser-is-store-of-record-for-anonymous-sentences.md)

## Context

This codebase already has two settled conventions for writing to
`localStorage`, and they disagree with each other on purpose.

**Preferences swallow.** `useMastered.js` wraps its write in a try/catch
with an empty body: *"mastered state just won't persist this session; not
worth surfacing as an error to the learner mid-study."* Its reader returns
an empty `Set` on a bad parse. The same shape holds for `sento:theme`,
`sento:romaji` and the four sound keys.

**User data throws, and never discards.** `localSentenceStore.js` does the
opposite on both counts (ADR 019). Writes raise a 507 because *"a save
that silently evaporates is the worst failure this feature has"*, and an
unreadable key is renamed to `…:quarantine:{timestamp}` rather than read
as empty, because the obvious `if (v !== 1) return []` *"destroys the
user's whole library at exactly the moment something has already gone
unexpectedly wrong."*

Epic 014 adds `sento:scores`, a history of completed quiz runs. It is not
obviously either kind. Losing it is worse than losing a muted-volume flag
and better than losing a library of written sentences: the runs cannot be
reconstructed, but the activity they record — studying — already happened
and can be done again.

Picking one convention wholesale gets it wrong in one direction or the
other. Following the preference convention discards history on the first
malformed byte. Following the store-of-record convention interrupts a
learner who has just finished a quiz with a dialog about storage.

## Decision

**The two halves are decided separately, and they land on opposite
sides.**

### Writes swallow, and `recordRun` returns `null`

A score is bookkeeping *about* an activity, not the artifact *of* one.
The studying is not lost when the note of it fails to save, and the moment
the write happens — the transition into a completed quiz — is the worst
possible moment to raise an error the learner can do nothing about.

`recordRun` returns the stored record, or `null` if the write failed, so a
caller that wants to know can ask without every caller having to catch.

This is explicitly MVP-level and is labelled as such in the source. v1
reports unavailable storage on the Progress surface the way
`components/generator/StorageNotices.jsx` already does for the generator.
Until then the accepted failure mode is a permanently empty stats page
with no explanation.

**Epic 015 must not inherit this.** A leaderboard submission is an action
the user explicitly took and is waiting on; failing it silently is not
graceful degradation but a lie about something they asked for. The line is
whether the user requested the operation, not how precious the bytes are.

### Reads quarantine

Unchanged from ADR 019, and for a sharper reason than "be careful". This
store rewrites its whole key on every write. A reader that returns `[]` on
unreadable data is therefore not a read at all — it is the first half of a
delete, and the next completed quiz is the second. The window between the
two is however long it takes to answer four questions.

`useMastered` gets away with the empty-set reader because mastery is one
boolean per card and the user restores it by clicking. History has no
equivalent recovery.

### The general rule this generalises to

**Rewrite-the-whole-key stores quarantine, regardless of how precious the
data is. Whether a write shouts is a separate question, answered by
whether the user asked for the write.** Those two axes were previously
bundled together in this codebase because the only two examples happened
to sit at opposite corners of the grid.

## Alternatives rejected

**Follow the preference convention on both counts** (empty on bad parse,
swallow on write). Rejected for the read: see above — with a
whole-key-rewrite store this is a delete on a timer, and it fires exactly
when something has already gone wrong.

**Follow the store-of-record convention on both counts** (quarantine,
throw). Rejected for the write. The throw has to be caught and rendered
somewhere, and the only place to render it is the summary card of a quiz
the learner has just finished. It converts a lost row into an interrupted
study session, which is a worse outcome than the one it reports.

**Store derived totals alongside the runs**, so the Progress view does not
recompute on every mount. Rejected: a stored counter and a stored list can
disagree, and then there are two truths with no way to tell which is
stale. `readStats()` derives from the array every call. The array is
capped at 200 records; there is no performance problem to solve here.

**Track quarantined keys in a module-level list**, mirroring
`localSentenceStore`'s `quarantinedKeys`. Rejected for now: that list
exists there because `StorageNotices.jsx` renders it, and there is no
equivalent surface in epic 014. A list nothing reads is the same
unreachable second arm that ADR 019 declined to build for the remote
store. v1 adds the list and the notice together.

## Consequences

**Positive:**

- A corrupt or future-versioned `sento:scores` costs the user their
  history's *visibility*, not its existence — the bytes stay on disk under
  a timestamped key and are recoverable by hand.
- A learner in private browsing can quiz normally. Nothing errors; the
  Progress page is simply empty.
- The rule for epic 015 is written down before it is needed, so the
  leaderboard submit does not silently inherit the wrong half.

**Negative:**

- Storage being unavailable is currently indistinguishable from having
  never taken a quiz. This is the known gap v1 closes, and it is the
  direct cost of choosing to swallow.
- Quarantined keys accumulate with no UI to see or clear them. Bounded in
  practice — quarantining requires data to already be corrupt — but
  nothing prunes them today.
- Two `localStorage` modules now implement quarantine separately.
  `getStorageStatus()` and the availability probe live inside
  `localSentenceStore.js`, and reaching across for them would muddy the
  boundary epic 013 drew. Extracting a shared util is deferred to v1,
  when the notice needs it and there is a second real caller to shape it
  against.
