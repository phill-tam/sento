import { useEffect, useRef } from "react";

import { usePairWriting } from "../../hooks/usePairWriting";
import { recordRun } from "../../stores/scoreStore";
import { linesOf } from "../../utils/runLines";
import PairPromptCard from "./PairPromptCard";
import PairQuizSummary from "./PairQuizSummary";

/**
 * Active word-pairs run (epic 012), mounted in the same slot as
 * QuizRunner and for the same reason: App.jsx intercepts an active run
 * above the view switch, so StudyPage never mounts underneath one.
 *
 * usePairWriting freezes its pairs at mount, so this component must not
 * be remounted mid-run — the slot in App.jsx is keyed on nothing and the
 * branch is stable for the life of the run, which is what keeps that
 * true.
 */
export default function PairWritingRunner({ selectedItems, onFinish, onQuit }) {
  const run = usePairWriting(selectedItems);
  const recorded = useRef(false);

  /**
   * Records on the transition into "complete" (epic 014). Same reasoning
   * as QuizRunner's, plus the part that is specific to this quiz type.
   *
   * `total` is gradedCount, NOT pairs.length. PairQuizSummary scores the
   * run out of what the grader actually judged, because a run where the
   * provider dropped two pairs must not read as "4 of 6, you got two
   * wrong" when those two were never marked. Storing pairs.length here
   * would recreate that exact claim on the Progress page, one screen
   * further along and with nothing on it to contradict the number.
   * skippedCount and ungradedCount carry the rest of the arithmetic so
   * the gap stays visible instead of being absorbed.
   *
   * Deliberately not sharing a record-building helper with QuizRunner:
   * the two differ precisely in the field that is easiest to get wrong,
   * and a shared builder is how they would stop differing.
   *
   * The ref latches the write against re-entry after completion, not
   * against StrictMode's mount-time double-invoke — that one is harmless
   * here, because the effect returns early until the run is complete.
   * The case it does catch is a dependency changing identity while the
   * summary is on screen. It never resets, which is correct: grading can
   * fail back to "writing" and be retried, but a run completes once.
   */
  useEffect(() => {
    if (run.phase !== "complete" || recorded.current) return;
    recorded.current = true;

    const { score, gradedCount, skippedCount, ungradedCount } = run.results;

    recordRun({
      quizType: "pairs",
      score,
      total: gradedCount,
      skippedCount,
      ungradedCount,
      lines: linesOf(selectedItems),
    });
  }, [run.phase, run.results, selectedItems]);

  if (run.phase === "complete") {
    return (
      <PairQuizSummary
        pairs={run.pairs}
        answers={run.answers}
        verdicts={run.verdicts}
        results={run.results}
        onFinish={onFinish}
      />
    );
  }

  return (
    <PairPromptCard
      pair={run.currentPair}
      value={run.answers[run.currentPair?.pairId] ?? ""}
      onChange={(text) => run.setAnswer(run.currentPair.pairId, text)}
      onNext={run.goNext}
      onBack={run.goBack}
      onSubmit={run.submitRun}
      onQuit={onQuit}
      pairNumber={run.pairNumber}
      totalPairs={run.totalPairs}
      isLastPair={run.isLastPair}
      isGrading={run.phase === "grading"}
      // The copy is composed here rather than in the hook, which reports
      // the two failures separately and stays free of user-facing strings.
      // Both say the answers survived, because that is the fact the
      // learner needs and the reason the hook never clears them.
      error={
        run.rateLimitError
          ? "The AI grader is busy right now. Your sentences are safe — try again in a moment."
          : run.error
          ? "Grading couldn't be reached. Your sentences are safe — try again."
          : null
      }
      isRateLimit={Boolean(run.rateLimitError)}
    />
  );
}
