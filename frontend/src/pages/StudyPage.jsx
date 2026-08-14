import { useMemo } from "react";
import ModeToggle from "../components/layouts/ModeToggle";
import FlashcardGrid from "../components/study/FlashcardGrid";
import QuizEmptyState from "../components/quiz/QuizEmptyState";
import QuizTypeChooser from "../components/quiz/QuizTypeChooser";
import { layoutForCategory } from "../utils/categoryLayout";
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
  onCancelSelection,
  quizType = "choice",
  onQuizTypeChange,
  quizSelectionCap = 20,
  quizMinSelection = 4,
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

  // epic 010 — activeCategoryId was already here, but only as the source
  // of the heading label above; the layout table is what needed the raw
  // id itself passed down.
  const layout = layoutForCategory(activeLineId, activeCategoryId);

  const isSelecting = quizPhase === "selecting";
  const isGeneratorSelecting = generatorSelectionPhase === "selecting";
  const activeSelectionMode = isSelecting ? "quiz" : isGeneratorSelecting ? "generator" : null;

  // Both selection sets are global, composite-key Sets ("lineId:itemId")
  // owned by App.jsx — FlashcardGrid stays generic, only ever dealing in
  // bare ids for whichever line is on screen, so these derive that subset.
  // The generator's set joined this shape when its refs started being
  // resolved per item rather than by the active line.
  function subsetForLine(keys) {
    const prefix = `${activeLineId}:`;
    return new Set(
      [...keys].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length))
    );
  }

  const quizSelectedIdsForLine = useMemo(
    () => subsetForLine(selectedIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, activeLineId]
  );

  const generatorSelectedIdsForLine = useMemo(
    () => subsetForLine(generatorSelectedIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [generatorSelectedIds, activeLineId]
  );

  function handleToggleQuizSelect(itemId) {
    onToggleSelect(activeLineId, itemId);
  }

  function handleToggleGeneratorSelect(itemId) {
    onToggleGeneratorSelect(activeLineId, itemId);
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
            selectionCap={quizSelectionCap}
            minSelection={quizMinSelection}
            onStartQuiz={onStartQuiz}
            onCancelSelection={onCancelSelection}
            generatorPhase={generatorSelectionPhase}
            generatorSelectedCount={generatorSelectedIds.size}
            generatorSelectionCap={generatorSelectionCap}
            generatorMinSelection={generatorMinSelection}
            onContinueGenerator={onContinueGenerator}
          />
        )}
      </div>

      {/* Only while picking. It is a property of the run being built, so
          once a run starts App.jsx has unmounted this page anyway, and
          showing it outside selection would offer a choice with nothing
          to apply it to. */}
      {isSelecting ? (
        <div className={styles.quizTypeRow}>
          <QuizTypeChooser value={quizType} onChange={onQuizTypeChange} />
        </div>
      ) : null}

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
              ? generatorSelectedIdsForLine
              : new Set()
          }
          // Only the generator passes this. Its set is now per-line like
          // the quiz's, and its cap of 5 is low enough to reach on one
          // line and then keep filling on the next, which is what the
          // total guards against. The quiz's own affordance has the same
          // gap and does not pass it — see the commit body; fixing that is
          // a change to shipped quiz behaviour and belongs on its own.
          selectedCount={
            activeSelectionMode === "generator" ? generatorSelectedIds.size : undefined
          }
          onToggleSelect={
            activeSelectionMode === "quiz"
              ? handleToggleQuizSelect
              : activeSelectionMode === "generator"
              ? handleToggleGeneratorSelect
              : undefined
          }
          selectionCap={
            activeSelectionMode === "generator" ? generatorSelectionCap : quizSelectionCap
          }
          layout={layout}
        />
      )}
    </div>
  );
}