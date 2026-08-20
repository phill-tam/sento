import { useEffect, useRef } from "react";

import { useQuiz } from "../../hooks/useQuiz";
import { recordRun } from "../../stores/scoreStore";
import { linesOf } from "../../utils/runLines";
import QuizCard from "./QuizCard";
import QuizSummary from "./QuizSummary";

/**
 * Active-quiz view, promoted from StudyPage (epic 6) so it renders
 * regardless of which page (Study or Generate) the quiz was launched
 * from — App.jsx intercepts quizPhase === "active" above the view
 * switch, so StudyPage/GeneratePage never mount while a quiz is active.
 */
export default function QuizRunner({ selectedItems, globalPool, onFinish, onQuit }) {
  const quiz = useQuiz(selectedItems, globalPool);
  const recorded = useRef(false);

  useEffect(() => {
    quiz.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Records on the transition into "complete", not in onFinish (epic 014).
   *
   * onFinish fires on the Finish *button*. A learner who reaches the
   * summary and closes the tab would lose the run they just finished,
   * which is the one moment the history is most worth having. Quitting
   * mid-run still records nothing — an abandoned run is not a result.
   *
   * The ref latches the write, and it does not guard what it looks like
   * it guards. StrictMode (main.jsx) does double-invoke effects on
   * mount, but this effect returns early there — the run is not complete
   * yet — so that doubling is harmless and measured to be so. What it
   * guards is re-entry AFTER completion: the effect re-runs whenever any
   * dependency changes identity, so a parent re-render handing down a
   * fresh selectedItems array while the summary is on screen would
   * record the same run a second time.
   *
   * It never resets. useQuiz's restart() is the one thing that could
   * legitimately re-arm it, and nothing wires restart() up — if
   * something ever does, this has to reset with it.
   *
   * For a choice quiz the shown denominator and the run length are the
   * same number. That is a property of this quiz type, not a shortcut —
   * see PairWritingRunner, where they are not.
   */
  useEffect(() => {
    if (quiz.phase !== "complete" || recorded.current) return;
    recorded.current = true;

    recordRun({
      quizType: "choice",
      score: quiz.score,
      total: quiz.totalQuestions,
      lines: linesOf(selectedItems),
    });
  }, [quiz.phase, quiz.score, quiz.totalQuestions, selectedItems]);

  if (quiz.phase === "complete") {
    return (
      <QuizSummary score={quiz.score} totalQuestions={quiz.totalQuestions} onFinish={onFinish} />
    );
  }

  if (quiz.phase === "idle") {
    return null;
  }

  return (
    <QuizCard
      question={quiz.currentQuestion}
      phase={quiz.phase}
      selectedOptionId={quiz.selectedOptionId}
      onAnswer={quiz.answer}
      onNext={quiz.next}
      questionNumber={quiz.questionNumber}
      totalQuestions={quiz.totalQuestions}
      score={quiz.score}
      onQuit={onQuit}
    />
  );
}
