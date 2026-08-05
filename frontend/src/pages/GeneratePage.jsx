import { useEffect, useState } from "react";
import {
  createSentenceFolder,
  deleteSentence,
  deleteSentenceFolder,
  getSentenceFolders,
  getSentences,
  moveSentence,
  renameSentenceFolder,
} from "../api";
import { useSentenceGenerator } from "../hooks/useSentenceGenerator";
import SentenceFolderTree from "../components/generator/SentenceFolderTree";
import SentenceList from "../components/generator/SentenceList";
import GenerateConfigForm from "../components/generator/GenerateConfigForm";
import SentenceReviewPanel from "../components/generator/SentenceReviewPanel";
import styles from "../styles/GeneratePage.module.css";

/**
 * Wires together every generator piece from Steps 7-13. Branches on a
 * locally-derived runPhase rather than requesting fine-grained sync from
 * App.jsx — see App.jsx's handleGeneratorRunComplete comment for why.
 *
 * workflowPhase: "browsing" | "configuring" | "generating" | "reviewing",
 * owned by App.jsx (guardNavigation reads it directly).
 * sourceItemRefs: fixed for the duration of one run, set by App.jsx's
 * handleContinueGenerator when the user leaves the Study page.
 */
export default function GeneratePage({ workflowPhase, sourceItemRefs, onRunComplete }) {
  const [folders, setFolders] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [sentences, setSentences] = useState([]);
  const [isLoadingBrowse, setIsLoadingBrowse] = useState(true);

  const generator = useSentenceGenerator(sourceItemRefs);

  // configuring/generating/reviewing collapse from workflowPhase alone;
  // which of the three is derived from the hook's own phase, since
  // useSentenceGenerator already tracks generating/reviewing precisely
  // and "configuring" is simply "in a run, but nothing generated yet".
  const runPhase =
    workflowPhase === "browsing"
      ? "browsing"
      : generator.phase === "idle"
      ? "configuring"
      : generator.phase; // "generating" | "reviewing"

  async function loadFolders() {
    const data = await getSentenceFolders();
    setFolders(data);
  }

  async function loadSentences(folderId) {
    setIsLoadingBrowse(true);
    const data = await getSentences(folderId ? { folderId } : undefined);
    setSentences(data);
    setIsLoadingBrowse(false);
  }

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (runPhase !== "browsing") return;
    loadSentences(activeFolderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runPhase, activeFolderId]);

  // sentenceCount per folder — SentenceFolderTree's delete-gate needs this,
  // but /sentence-folders doesn't return it and a fresh count per folder
  // isn't worth N extra requests here. Approximated from the currently
  // loaded sentences list: exact when browsing that folder, best-effort
  // (treated as non-zero-safe, i.e. blocks delete) otherwise — a folder
  // can only be deleted while it's the one currently open and shown empty.
  const folderCounts = Object.fromEntries(
    folders.map((f) => [f.id, f.id === activeFolderId ? sentences.length : 1])
  );
  const foldersWithCounts = folders.map((f) => ({ ...f, sentenceCount: folderCounts[f.id] }));

  async function handleCreateFolder(name) {
    await createSentenceFolder(name);
    await loadFolders();
  }

  async function handleRenameFolder(folderId, name) {
    await renameSentenceFolder(folderId, name);
    await loadFolders();
  }

  async function handleDeleteFolder(folderId) {
    await deleteSentenceFolder(folderId);
    if (activeFolderId === folderId) setActiveFolderId(null);
    await loadFolders();
  }

  async function handleRelocateSentence(sentenceId, folderId) {
    await moveSentence(sentenceId, folderId);
    await loadSentences(activeFolderId);
  }

  async function handleDeleteSentence(sentenceId) {
    await deleteSentence(sentenceId);
    await loadSentences(activeFolderId);
  }

  async function handleSave(folderId) {
    await generator.save(folderId);
    onRunComplete();
  }

  if (runPhase === "browsing") {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Sentence Generator</h1>
        <div className={styles.browseLayout}>
          <aside className={styles.folderPane}>
            <SentenceFolderTree
              folders={foldersWithCounts}
              activeFolderId={activeFolderId}
              onSelectFolder={setActiveFolderId}
              onCreateFolder={handleCreateFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
            />
          </aside>
          <main className={styles.listPane}>
            {isLoadingBrowse ? (
              <p className={styles.loading}>Loading…</p>
            ) : (
              <SentenceList
                sentences={sentences}
                folders={folders}
                onRelocate={handleRelocateSentence}
                onDelete={handleDeleteSentence}
              />
            )}
          </main>
        </div>
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

  // generating | reviewing
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