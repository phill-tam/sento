import { usePairWriting } from "../../hooks/usePairWriting";
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
