import { useEffect } from "react";

import { useQuiz } from "../../hooks/useQuiz";
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

  useEffect(() => {
    quiz.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
