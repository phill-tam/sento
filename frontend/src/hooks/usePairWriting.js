import { useCallback, useMemo, useState } from "react";
import { RateLimitError, gradePairAnswers } from "../api";
import { SKIPPED, partitionAnswers } from "../utils/answerPrecheck";
import { buildPairs } from "../utils/wordPairs";

/**
 * Run state machine for Word Pairs (epic 012).
 *
 * Mirrors useQuiz's "state machine in a hook" shape: the pairs are built
 * once at mount and frozen, and the hook owns phase/index/answers while
 * the components stay controlled.
 *
 * The run is graded in ONE call at the end, not per answer. That is a
 * cost decision as much as a pedagogical one — the endpoint spends
 * provider quota with no authentication in front of it, and per-answer
 * grading multiplied a six-pair run by six. It also stopped the grader's
 * suggested sentence for pair 1 becoming a template for pair 2. See #126.
 */

// Matches MAX_ANSWER_LENGTH in the backend's pair_writing schema. Nothing
// shares constants across the two languages in this project, so the two
// have to move together — the server rejects 301 characters outright.
export const MAX_ANSWER_LENGTH = 300;

export function usePairWriting(selectedItems) {
  const pairs = useMemo(
    () => buildPairs(selectedItems),
    // frozen at mount, exactly as useQuiz freezes its questions — the
    // caller guards navigation while a run is live
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [phase, setPhase] = useState("writing");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [verdicts, setVerdicts] = useState({});
  const [error, setError] = useState(null);
  const [rateLimitError, setRateLimitError] = useState(null);

  const currentPair = pairs[index] ?? null;
  const isLastPair = index >= pairs.length - 1;

  const setAnswer = useCallback((pairId, text) => {
    setAnswers((prev) => ({ ...prev, [pairId]: text.slice(0, MAX_ANSWER_LENGTH) }));
  }, []);

  const goNext = useCallback(() => {
    setIndex((prev) => Math.min(prev + 1, pairs.length - 1));
  }, [pairs.length]);

  const goBack = useCallback(() => {
    setIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  /**
   * Grades the run.
   *
   * Blank answers and clearly off-task ones never reach the provider —
   * they are resolved locally and simply left out of the request. If that
   * empties the request entirely the call is skipped altogether rather
   * than sending `answers: []`, which the backend rejects.
   *
   * On failure NOTHING typed is discarded. `answers` is untouched and the
   * phase returns to "writing" with an error set, so Retry re-sends the
   * same run — the alternative is throwing away six sentences of the
   * learner's own writing because of a 502. Same rule
   * useSentenceGenerator follows for kept sentences.
   */
  const submitRun = useCallback(async () => {
    setError(null);
    setRateLimitError(null);

    const { local, toGrade } = partitionAnswers(pairs, answers);

    if (toGrade.length === 0) {
      setVerdicts(local);
      setPhase("complete");
      return;
    }

    setPhase("grading");
    try {
      const response = await gradePairAnswers({ answers: toGrade });
      const graded = Object.fromEntries(
        response.verdicts.map((v) => [v.pair_id, { ...v, pairId: v.pair_id }])
      );
      setVerdicts({ ...local, ...graded });
      setPhase("complete");
    } catch (err) {
      setPhase("writing");
      if (err instanceof RateLimitError) {
        setRateLimitError(err.message);
      } else {
        setError(err.message || "Grading failed");
      }
    }
  }, [pairs, answers]);

  /**
   * Score counts only pairs the grader actually judged. A run where the
   * provider failed on two pairs must not read as "4/6, you got two
   * wrong" — skipped and ungradeable are reported separately.
   */
  const results = useMemo(() => {
    const all = pairs.map((pair) => verdicts[pair.pairId]).filter(Boolean);
    const graded = all.filter((v) => v.verdict === "correct" || v.verdict === "incorrect");
    return {
      score: graded.filter((v) => v.verdict === "correct").length,
      gradedCount: graded.length,
      skippedCount: all.filter((v) => v.verdict === SKIPPED).length,
      ungradedCount: all.filter((v) => v.verdict === "ungradeable").length,
    };
  }, [pairs, verdicts]);

  return {
    phase,
    pairs,
    currentPair,
    pairNumber: index + 1,
    totalPairs: pairs.length,
    isLastPair,
    answers,
    verdicts,
    results,
    error,
    rateLimitError,
    setAnswer,
    goNext,
    goBack,
    submitRun,
  };
}
