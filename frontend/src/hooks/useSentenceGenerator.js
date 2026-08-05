import { useCallback, useState } from "react";
import { RateLimitError, generateSentences, saveSentences } from "../api";

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

  const save = useCallback(
    async (folderId) => {
      const response = await saveSentences({
        sentences: keptSentences.map((s) => ({
          jp_text: s.jp_text,
          reading: s.reading,
          meaning_en: s.meaning_en,
          source_item_refs: sourceItemRefs,
        })),
        folderId,
      });
      setKeptSentences([]);
      setCandidates([]);
      setPhase("idle");
      return response.saved;
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