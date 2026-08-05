import { useSentenceGenerator } from "../hooks/useSentenceGenerator";
import SentenceList from "../components/generator/SentenceList";
import GenerateConfigForm from "../components/generator/GenerateConfigForm";
import SentenceReviewPanel from "../components/generator/SentenceReviewPanel";
import styles from "../styles/GeneratePage.module.css";

/**
 * Folder tree now lives in App.jsx's sidebar (fix: folder-tree-sidebar) —
 * this page only renders the main-panel content for each workflow phase.
 * folders/sentences/isLoadingSentences and the relocate/delete handlers
 * are owned by App.jsx and passed straight through.
 */
export default function GeneratePage({
  workflowPhase,
  sourceItemRefs,
  onRunComplete,
  folders,
  sentences,
  isLoadingSentences,
  onRelocateSentence,
  onDeleteSentence,
}) {
  const generator = useSentenceGenerator(sourceItemRefs);

  const runPhase =
    workflowPhase === "browsing"
      ? "browsing"
      : generator.phase === "idle"
      ? "configuring"
      : generator.phase;

  async function handleSave(folderId) {
    await generator.save(folderId);
    onRunComplete();
  }

  if (runPhase === "browsing") {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Sentence Generator</h1>
        {isLoadingSentences ? (
          <p className={styles.loading}>Loading…</p>
        ) : (
          <SentenceList
            sentences={sentences}
            folders={folders}
            onRelocate={onRelocateSentence}
            onDelete={onDeleteSentence}
          />
        )}
      </div>
    );
  }

  if (runPhase === "configuring") {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Sentence Generator</h1>
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
      <h1 className={styles.title}>Sentence Generator</h1>
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