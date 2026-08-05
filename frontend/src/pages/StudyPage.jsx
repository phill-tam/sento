import { useMemo } from "react";
import ModeToggle from "../components/layouts/ModeToggle";
import FlashcardGrid from "../components/study/FlashcardGrid";
import QuizEmptyState from "../components/quiz/QuizEmptyState";
import styles from "../styles/StudyPage.module.css";

// Display-only fallback for QuizEmptyState's copy — actual gating now
// uses the canQuiz/quizPoolSize props from App.jsx (epic 6: eligibility
// is based on the GLOBAL pool, not this page's active category).
const MIN_QUIZ_ITEMS = 4;

export default function StudyPage({
  activeLine,
  activeLineId,
  activeCategoryId,
  items,
  mastered,
  onToggleMastered,
  masteredCount,
  progressPct,
  isLoading,
  mode,
  onModeChange,
  canQuiz,
  quizPoolSize = 0,
  quizPhase = "idle",
  selectedIds = new Set(),
  onToggleSelect,
  onStartQuiz,
  generatorSelectionPhase = "idle",
  generatorSelectedIds = new Set(),
  onToggleGeneratorSelect,
  generatorMinSelection = 2,
  generatorSelectionCap = 5,
  onGeneratorClick,
  onContinueGenerator,
}) {
  const categoryLabel = activeCategoryId
    ? activeCategoryId
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "Select a category";

  const isSelecting = quizPhase === "selecting";
  const isGeneratorSelecting = generatorSelectionPhase === "selecting";
  const activeSelectionMode = isSelecting ? "quiz" : isGeneratorSelecting ? "generator" : null;

  // selectedIds is the global, composite-key Set ("lineId:itemId") owned
  // by App.jsx — FlashcardGrid stays generic, only ever dealing in bare
  // ids for whichever line is on screen, so this derives that subset.
  const quizSelectedIdsForLine = useMemo(() => {
    const prefix = `${activeLineId}:`;
    const bareIds = [...selectedIds]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
    return new Set(bareIds);
  }, [selectedIds, activeLineId]);

  function handleToggleQuizSelect(itemId) {
    onToggleSelect(activeLineId, itemId);
  }

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
        {!canQuiz ? (
          <QuizEmptyState itemCount={quizPoolSize} minRequired={MIN_QUIZ_ITEMS} />
        ) : (
          <ModeToggle
            mode={mode}
            onModeChange={handleModeChange}
            onGeneratorClick={onGeneratorClick}
            quizPhase={quizPhase}
            selectedCount={selectedIds.size}
            onStartQuiz={onStartQuiz}
            generatorPhase={generatorSelectionPhase}
            generatorSelectedCount={generatorSelectedIds.size}
            generatorSelectionCap={generatorSelectionCap}
            generatorMinSelection={generatorMinSelection}
            onContinueGenerator={onContinueGenerator}
          />
        )}
      </div>

      <div className={styles.progressStrip}>
        <span>
          {masteredCount} / {items.length} mastered
        </span>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {isLoading ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        <FlashcardGrid
          items={items}
          categoryLabel={categoryLabel}
          mastered={mastered}
          onToggleMastered={onToggleMastered}
          selectionMode={activeSelectionMode !== null}
          selectedIds={
            activeSelectionMode === "quiz"
              ? quizSelectedIdsForLine
              : activeSelectionMode === "generator"
              ? generatorSelectedIds
              : new Set()
          }
          onToggleSelect={
            activeSelectionMode === "quiz"
              ? handleToggleQuizSelect
              : activeSelectionMode === "generator"
              ? onToggleGeneratorSelect
              : undefined
          }
          selectionCap={activeSelectionMode === "generator" ? generatorSelectionCap : 20}
        />
      )}
    </div>
  );
}