import { useEffect, useMemo } from "react";
import ModeToggle from "../components/layouts/ModeToggle";
import FlashcardGrid from "../components/study/FlashcardGrid";
import QuizCard from "../components/quiz/QuizCard";
import QuizSummary from "../components/quiz/QuizSummary";
import QuizEmptyState from "../components/quiz/QuizEmptyState";
import { useQuiz } from "../hooks/useQuiz";
import styles from "../styles/StudyPage.module.css";

const MIN_QUIZ_ITEMS = 4;

/**
 * Local subcomponent so useQuiz only mounts — and only freezes its
 * question set — once quizPhase reaches "active". Unmounting it (leaving
 * "active") discards the hook instance entirely, matching Finish/discard
 * both needing a clean slate for the next attempt.
 */
function QuizRunner({ selectedItems, categoryPool, onFinish }) {
  const quiz = useQuiz(selectedItems, categoryPool);

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
    return null; // one tick before start() takes effect
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
    />
  );
}

export default function StudyPage({
  activeLine,
  activeCategoryId,
  items,
  mastered,
  onToggleMastered,
  masteredCount,
  progressPct,
  isLoading,
  mode,
  onModeChange,
  quizPhase = "idle",
  selectedIds = new Set(),
  onToggleSelect,
  onStartQuiz,
  onFinishQuiz,
}) {
  const categoryLabel = activeCategoryId
    ? activeCategoryId
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "Select a category";

  const isSelecting = quizPhase === "selecting";
  const isQuizActive = quizPhase === "active";
  const canQuiz = items.length >= MIN_QUIZ_ITEMS;

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  // StudyPage owns the too-small-to-quiz decision; ModeToggle stays
  // generic and never learns about item counts (Decision 2).
  function handleModeChange(nextMode) {
    if (nextMode === "quiz" && !canQuiz) return;
    onModeChange(nextMode);
  }

  return (
    <div className={styles.page}>
      <div className={styles.platformHead}>
        <div>
          <h1>
            <span className={styles.icon}>{activeLine?.icon}</span>
            {categoryLabel}
          </h1>
          <p>
            <span className={styles.crumbCat}>{activeLine?.label}</span>
            <span>{items.length} items</span>
          </p>
        </div>
        {!canQuiz && !isQuizActive ? (
          <QuizEmptyState itemCount={items.length} minRequired={MIN_QUIZ_ITEMS} />
        ) : (
          <ModeToggle
            mode={mode}
            onModeChange={handleModeChange}
            onGeneratorClick={() => {}}
            quizPhase={quizPhase}
            selectedCount={selectedIds.size}
            onStartQuiz={onStartQuiz}
          />
        )}
      </div>

      {!isQuizActive && (
        <div className={styles.progressStrip}>
          <span>
            {masteredCount} / {items.length} mastered
          </span>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {isLoading ? (
        <p className={styles.loading}>Loading…</p>
      ) : isQuizActive ? (
        <QuizRunner selectedItems={selectedItems} categoryPool={items} onFinish={onFinishQuiz} />
      ) : (
        <FlashcardGrid
          items={items}
          categoryLabel={categoryLabel}
          mastered={mastered}
          onToggleMastered={onToggleMastered}
          selectionMode={isSelecting}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      )}
    </div>
  );
}