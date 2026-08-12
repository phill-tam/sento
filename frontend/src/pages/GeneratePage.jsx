import { useMemo } from "react";
import ModeToggle from "../components/layouts/ModeToggle";
import QuizEmptyState from "../components/quiz/QuizEmptyState";
import { useSentenceGenerator } from "../hooks/useSentenceGenerator";
import SentenceList from "../components/generator/SentenceList";
import GenerateConfigForm from "../components/generator/GenerateConfigForm";
import SentenceReviewPanel from "../components/generator/SentenceReviewPanel";
import styles from "../styles/GeneratePage.module.css";

// Display-only fallback for QuizEmptyState's copy, mirrors StudyPage's
// own local constant — gating itself uses the canQuiz/quizPoolSize
// props (global pool, owned by App.jsx).
const MIN_QUIZ_ITEMS = 4;

export default function GeneratePage({
  workflowPhase,
  sourceItemRefs,
  onRunComplete,
  folders,
  sentences,
  isLoadingSentences,
  onRelocateSentence,
  onDeleteSentence,
  // epic 6 — same ModeToggle-driving props StudyPage receives, so
  // Study/Quiz/Generator work identically from this page too.
  mode,
  onModeChange,
  canQuiz,
  quizPoolSize = 0,
  quizPhase = "idle",
  selectedIds = new Set(),
  onToggleSelect,
  onStartQuiz,
  onCancelSelection,
  generatorSelectionPhase = "idle",
  generatorSelectedIds = new Set(),
  generatorMinSelection = 2,
  generatorSelectionCap = 5,
  onGeneratorClick,
  onContinueGenerator,
}) {
  const generator = useSentenceGenerator(sourceItemRefs);

  const runPhase =
    workflowPhase === "browsing"
      ? "browsing"
      : generator.phase === "idle"
      ? "configuring"
      : generator.phase;

  const isQuizSelecting = quizPhase === "selecting";

  // Bare sentence ids selected for quiz, derived from the global
  // composite-key Set — same translation StudyPage does for its own
  // line (see App.jsx's makeSelectionKey / Step 1 decision note).
  const quizSelectedSentenceIds = useMemo(() => {
    const prefix = "sentence:";
    return new Set(
      [...selectedIds].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length))
    );
  }, [selectedIds]);

  function handleToggleQuizSelectSentence(sentenceId) {
    onToggleSelect("sentence", sentenceId);
  }

  async function handleSave(folderId) {
    await generator.save(folderId);
    onRunComplete();
  }

  const header = (
    <div className={styles.header}>
      <h1 className={styles.title}>Sentence Generator</h1>
      {!canQuiz ? (
        <QuizEmptyState itemCount={quizPoolSize} minRequired={MIN_QUIZ_ITEMS} />
      ) : (
        <ModeToggle
          mode={mode}
          onModeChange={onModeChange}
          onGeneratorClick={onGeneratorClick}
          quizPhase={quizPhase}
          selectedCount={selectedIds.size}
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
  );

  if (runPhase === "browsing") {
    return (
      <div className={styles.page}>
        {header}
        {isLoadingSentences ? (
          <p className={styles.loading}>Loading…</p>
        ) : (
          <SentenceList
            sentences={sentences}
            folders={folders}
            onRelocate={onRelocateSentence}
            onDelete={onDeleteSentence}
            selectionMode={isQuizSelecting}
            selectedIds={quizSelectedSentenceIds}
            onToggleSelect={handleToggleQuizSelectSentence}
            selectionCap={20}
          />
        )}
      </div>
    );
  }

  if (runPhase === "configuring") {
    return (
      <div className={styles.page}>
        {header}
        <GenerateConfigForm
          sourceItemCount={sourceItemRefs.length}
          isGenerating={false}
          onGenerate={(count, nuance) => generator.generate(count, nuance)}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {header}
      <SentenceReviewPanel
        candidates={generator.candidates}
        keptSentences={generator.keptSentences}
        phase={generator.phase}
        error={generator.error}
        rateLimitError={generator.rateLimitError}
        folders={folders}
        onKeep={generator.keepCandidate}
        onDiscard={generator.discardCandidate}
        onRemoveKept={generator.removeKept}
        onRegenerate={() => generator.generate(generator.candidates.length || 1, null)}
        onSave={handleSave}
      />
    </div>
  );
}