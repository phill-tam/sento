import { useCallback, useState } from "react";
// Generation stays on the server — it needs a provider API key. Saving
// does not, and goes to the browser instead (epic 013). This one split
// import is the whole local/remote boundary made visible.
import { RateLimitError, generateSentences } from "../api";
import { saveSentences } from "../stores/sentenceStore";

/**
 * Generator run state machine over a fixed set of source item refs
 * (selected on the Study page, carried forward — see App.jsx's lift).
 *
 * Mirrors useQuiz's "state machine in a hook" pattern: phase here is
 * hook-internal (idle/generating/reviewing), tracking the async
 * generate/save lifecycle only. App.jsx's generatorWorkflowPhase is a
 * separate, broader concept (browsing/configuring/generating/reviewing)
 * that also covers pure-navigation states with no API call in flight —
 * same split as useQuiz's phase vs. App.jsx's quizPhase.
 *
 * sourceItemRefs: [{ line_id, item_id }] — already backend-shaped, no
 * camelCase conversion layer, matching how the rest of this codebase
 * reads API response fields directly (see App.jsx's toFlashcardItems).
 */
export function useSentenceGenerator(sourceItemRefs) {
  const [phase, setPhase] = useState("idle");
  const [candidates, setCandidates] = useState([]);
  const [keptSentences, setKeptSentences] = useState([]);
  const [error, setError] = useState(null);
  const [rateLimitError, setRateLimitError] = useState(null);

  const hasResults = keptSentences.length > 0 || candidates.length > 0;

  const generate = useCallback(
    async (count, nuance) => {
      setPhase("generating");
      setError(null);
      setRateLimitError(null);

      try {
        const response = await generateSentences({ sourceItemRefs, count, nuance });
        // Ephemeral candidates carry no server id (not persisted until
        // Save) — a client-only _tempId is needed for React keys and
        // for keep/discard to target the right item in the array.
        const withTempIds = response.candidates.map((c) => ({
          ...c,
          _tempId: crypto.randomUUID(),
        }));
        setCandidates(withTempIds);
        setPhase("reviewing");
      } catch (err) {
        // Kept sentences from prior rounds must stay visible on failure —
        // per epic: "clear error notice, not silent failure or a
        // confusing empty result." Only candidates are cleared; nothing
        // kept is ever lost to a failed regenerate.
        setCandidates([]);
        setPhase(hasResults ? "reviewing" : "idle");
        if (err instanceof RateLimitError) {
          setRateLimitError(err.message);
        } else {
          setError(err.message || "Sentence generation failed");
        }
      }
    },
    [sourceItemRefs, hasResults]
  );

  const keepCandidate = useCallback(
    (tempId) => {
      const target = candidates.find((c) => c._tempId === tempId);
      if (!target) return;
      setCandidates((prev) => prev.filter((c) => c._tempId !== tempId));
      setKeptSentences((prev) => [...prev, target]);
    },
    [candidates]
  );

  const discardCandidate = useCallback((tempId) => {
    setCandidates((prev) => prev.filter((c) => c._tempId !== tempId));
  }, []);

  const removeKept = useCallback((tempId) => {
    setKeptSentences((prev) => prev.filter((s) => s._tempId !== tempId));
  }, []);

  /**
   * Returns the saved rows, or null if the save failed.
   *
   * epic 013 — saving can now fail for a reason the server never had:
   * browser storage being blocked or full. It used to be safe to assume
   * success, since an unhandled rejection here still left the rows on the
   * server. It is not safe now — nothing else holds these sentences — so a
   * failure keeps everything kept exactly where it is and reports itself
   * through the same `error` the panel already renders. Same principle as
   * generate's catch: nothing kept is ever lost to a failed call.
   */
  const save = useCallback(
    async (folderId) => {
      setError(null);

      try {
        const response = await saveSentences({
          sentences: keptSentences.map((s) => ({
            jp_text: s.jp_text,
            reading: s.reading,
            // Carried through from the candidate rather than regenerated —
            // the provider produced it at generation time and there is no
            // way to recover it afterwards (a sentence can't be
            // transliterated from its reading, ADR 015). Dropping it here
            // would silently save every sentence without romaji.
            romaji: s.romaji ?? null,
            meaning_en: s.meaning_en,
            source_item_refs: sourceItemRefs,
          })),
          folderId,
        });
        setKeptSentences([]);
        setCandidates([]);
        setPhase("idle");
        return response.saved;
      } catch (err) {
        setError(err.message || "Could not save these sentences");
        return null;
      }
    },
    [keptSentences, sourceItemRefs]
  );

  const resetRun = useCallback(() => {
    setPhase("idle");
    setCandidates([]);
    setKeptSentences([]);
    setError(null);
    setRateLimitError(null);
  }, []);

  return {
    phase,
    candidates,
    keptSentences,
    error,
    rateLimitError,
    generate,
    keepCandidate,
    discardCandidate,
    removeKept,
    save,
    resetRun,
  };
}