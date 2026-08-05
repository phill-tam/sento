import { useEffect, useMemo, useState } from "react";
import { FEATURE_FLAGS } from "./config/featureFlags";
import { 
  getGrammar,
  getKanji,
  getVocab,
  createSentenceFolder,
  deleteSentence,
  deleteSentenceFolder,
  getSentenceFolders,
  getSentences,
  moveSentence,
  renameSentenceFolder,
} from "./api";
import { CONTENT_LINES } from "./constants/contentLines";
import { useMastered } from "./hooks/useMastered";
import { toStudyTreeShape } from "./utils/studyTreeAdapter";
import { buildSearchIndex, searchIndex } from "./utils/searchIndex";
import AppShell from "./components/layouts/AppShell";
import ModeToggle from "./components/layouts/ModeToggle";
import CategoryTree from "./components/layouts/CategoryTree";
import IconRail from "./components/layouts/IconRail";
import SentenceFolderTree from "./components/generator/SentenceFolderTree";
import SearchResults from "./components/study/SearchResults";
import ContentManagementPage from "./pages/ContentManagementPage";
import StudyPage from "./pages/StudyPage";
import GeneratePage from "./pages/GeneratePage";
import ConfirmDialog from "./components/common/ConfirmDialog";
import styles from "./styles/Sidebar.module.css";

const VIEWS = [
  { id: "study", icon: "学", label: "Study" },
  { id: "cms", icon: "文", label: "Manage Content" },
  { id: "generate", icon: "✨", label: "Generate" },
];

const FETCHERS = { kanji: getKanji, vocab: getVocab, grammar: getGrammar };

// Quiz selection cap (epic 004) — enforced in toggleSelectItem below,
// independent of FlashcardGrid's own UI-level selectDisabled check.
const SELECTION_CAP = 20;

// Sentence Generator selection cap (epic 5) — distinct from Quiz's 20/4,
// per the epic's explicit "minimum 2, maximum 5" decision.
const GENERATOR_SELECTION_CAP = 5;
const GENERATOR_MIN_SELECTION = 2;

/**
 * Maps one line's raw entries into FlashcardCard's normalized item shape.
 * Moved here from StudyPage.jsx along with the rest of study state — still
 * local, App.jsx is the only caller.
 */
function toFlashcardItems(lineId, entries) {
  if (lineId === "kanji") {
    return entries.map((e) => ({
      id: e.id,
      lineId,
      prompt: e.character,
      reading: [e.onyomi, e.kunyomi].filter(Boolean).join(", "),
      onyomi: e.onyomi,
      kunyomi: e.kunyomi,
      answer: e.meaning_en,
      example: e.compound_word
        ? { jp: e.compound_word, reading: e.compound_reading, en: e.compound_meaning_en }
        : null,
    }));
  }
  if (lineId === "vocab") {
    return entries.map((e) => ({
      id: e.id,
      lineId,
      prompt: e.word,
      reading: e.reading ?? "",
      answer: e.meaning_en,
      example: null,
    }));
  }
  return entries.map((e) => ({
    id: e.id,
    lineId,
    prompt: e.pattern,
    reading: null,
    answer: e.meaning_en,
    example: e.example_jp
      ? { jp: e.example_jp, reading: e.example_reading, en: e.example_en }
      : null,
  }));
}

function App() {
  const [mode, setMode] = useState("study");
  const [view, setView] = useState("study");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const contentManagementEnabled = FEATURE_FLAGS.FEATURE_CONTENT_MANAGEMENT;
  const studyFlashcardsEnabled = FEATURE_FLAGS.FEATURE_STUDY_FLASHCARDS;
  const sentenceGeneratorEnabled = FEATURE_FLAGS.FEATURE_SENTENCE_GENERATOR;

  // Study state, lifted from StudyPage.jsx — App.jsx owns this because the
  // real sidebar's search input and CategoryTree need it too, and both
  // live here, not inside StudyPage.
  const [dataByLine, setDataByLine] = useState({ kanji: [], vocab: [], grammar: [] });
  const [isLoadingStudy, setIsLoadingStudy] = useState(true);
  const [openLineIds, setOpenLineIds] = useState(new Set());
  const [activeLineId, setActiveLineId] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Quiz state (epic 004) — owned here rather than in StudyPage because
  // the sidebar's navigation handlers below need to check quizPhase
  // before acting (guardNavigation), and those handlers live in App.jsx.
  const [quizPhase, setQuizPhase] = useState("idle");
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Sentence Generator state (epic 5). Two separate phase concepts, not
  // one: generatorSelectionPhase parallels quizPhase (Study-page
  // selection step); generatorWorkflowPhase governs the Generate page
  // itself once the user arrives there. Both live here for the same
  // reason quizPhase does — guardNavigation and the side nav need to
  // read them.
  const [generatorSelectionPhase, setGeneratorSelectionPhase] = useState("idle");
  const [generatorSelectedIds, setGeneratorSelectedIds] = useState(new Set());
  const [generatorWorkflowPhase, setGeneratorWorkflowPhase] = useState("browsing");
  const [generatorSourceItemRefs, setGeneratorSourceItemRefs] = useState([]);

  // Folder + saved-sentence data, lifted here for the same reason
  // dataByLine is: the sidebar slot renders in App.jsx, so whatever it
  // displays (SentenceFolderTree, here) needs its data owned here too.
  const [generatorFolders, setGeneratorFolders] = useState([]);
  const [activeSentenceFolderId, setActiveSentenceFolderId] = useState(null);
  const [generatorSentences, setGeneratorSentences] = useState([]);
  const [isLoadingGeneratorSentences, setIsLoadingGeneratorSentences] = useState(true);

  // holds a closure for whatever navigation action triggered the confirm
  // dialog — null means the dialog is closed.
  const [pendingAction, setPendingAction] = useState(null);

  const quizInProgress = quizPhase === "selecting" || quizPhase === "active";
  // "browsing" is not in-progress — the epic explicitly says navigating
  // to the Generate page directly (side nav) defaults there with no
  // guard needed; only an active run (configuring/generating/reviewing)
  // is guarded, same as Quiz's selecting/active.
  const generatorInProgress =
    generatorWorkflowPhase === "configuring" ||
    generatorWorkflowPhase === "generating" ||
    generatorWorkflowPhase === "reviewing";

  function guardNavigation(action) {
    if (quizInProgress || generatorInProgress) {
      setPendingAction(() => action);
    } else {
      action();
    }
  }

  function confirmDiscardInProgress() {
    // Reset whichever flow is actually in progress — mutually exclusive
    // in practice (App.jsx never lets both be active at once), but
    // resetting both defensively costs nothing and avoids a stale phase
    // surviving into the next session if that assumption is ever broken.
    setQuizPhase("idle");
    setSelectedIds(new Set());
    setGeneratorSelectionPhase("idle");
    setGeneratorSelectedIds(new Set());
    setGeneratorWorkflowPhase("browsing");
    setGeneratorSourceItemRefs([]);
    setMode("study");
    const action = pendingAction;
    setPendingAction(null);
    if (action) action();
  }

  function cancelPendingDiscard() {
    setPendingAction(null);
  }

  function toggleSelectItem(itemId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        // cap enforced here too, not just via FlashcardGrid's selectDisabled —
        // this prevents the state update itself from ever exceeding the cap
        // regardless of caller
        if (next.size >= SELECTION_CAP) return prev;
        next.add(itemId);
      }
      return next;
    });
  }

  function toggleGeneratorSelectItem(itemId) {
    setGeneratorSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        if (next.size >= GENERATOR_SELECTION_CAP) return prev;
        next.add(itemId);
      }
      return next;
    });
  }

  function handleGeneratorClick() {
    guardNavigation(() => {
      setMode("generate");
      setGeneratorSelectionPhase("selecting");
      setGeneratorSelectedIds(new Set());
    });
  }

  function handleContinueGenerator() {
    // Captures the current selection as this run's fixed source item
    // refs. Assumes every selected id belongs to activeLineId — true
    // today since FlashcardGrid only ever shows one line/category's
    // items at a time (same assumption Quiz's selectedItems makes).
    const refs = [...generatorSelectedIds].map((itemId) => ({
      line_id: activeLineId,
      item_id: itemId,
    }));
    setGeneratorSourceItemRefs(refs);
    setGeneratorSelectionPhase("idle");
    setGeneratorSelectedIds(new Set());
    setMode("study");
    setGeneratorWorkflowPhase("configuring");
    setView("generate");
  }

 // Called by GeneratePage once a save completes (Section 2 UX flow:
 // "workflow phase resets; the page shows the saved sentences in the
 // browsing view"). This is the only workflow-phase transition App.jsx
 // needs to know about — guardNavigation treats configuring/generating/
 // reviewing identically (generatorInProgress = phase !== "browsing"),
 // so GeneratePage never needs to report intermediate sub-states back up.
 function handleGeneratorRunComplete() {
   setGeneratorWorkflowPhase("browsing");
   setGeneratorSourceItemRefs([]);
 }

  async function loadGeneratorFolders() {
    const data = await getSentenceFolders();
    setGeneratorFolders(data);
  }

  async function loadGeneratorSentences(folderId) {
    setIsLoadingGeneratorSentences(true);
    const data = await getSentences(folderId ? { folderId } : undefined);
    setGeneratorSentences(data);
    setIsLoadingGeneratorSentences(false);
  }

  async function handleCreateFolder(name) {
    await createSentenceFolder(name);
    await loadGeneratorFolders();
  }

  async function handleRenameFolder(folderId, name) {
    await renameSentenceFolder(folderId, name);
    await loadGeneratorFolders();
  }

  async function handleDeleteFolder(folderId) {
    await deleteSentenceFolder(folderId);
    if (activeSentenceFolderId === folderId) setActiveSentenceFolderId(null);
    await loadGeneratorFolders();
  }

  async function handleRelocateSentence(sentenceId, folderId) {
    await moveSentence(sentenceId, folderId);
    await loadGeneratorSentences(activeSentenceFolderId);
  }

  async function handleDeleteSentence(sentenceId) {
    await deleteSentence(sentenceId);
    await loadGeneratorSentences(activeSentenceFolderId);
  }

  const kanjiMastered = useMastered("kanji");
  const vocabMastered = useMastered("vocab");
  const grammarMastered = useMastered("grammar");
  const masteredByLine = {
    kanji: kanjiMastered.mastered,
    vocab: vocabMastered.mastered,
    grammar: grammarMastered.mastered,
  };
  const toggleByLine = {
    kanji: kanjiMastered.toggle,
    vocab: vocabMastered.toggle,
    grammar: grammarMastered.toggle,
  };

  useEffect(() => {
    // skip entirely when the flag is off — avoids fetching study data on
    // every app load just because App.jsx now owns this state
    if (!studyFlashcardsEnabled) return;
    let cancelled = false;
    async function loadAll() {
      setIsLoadingStudy(true);
      const entries = await Promise.all(CONTENT_LINES.map((line) => FETCHERS[line.id]()));
      if (cancelled) return;
      const next = Object.fromEntries(CONTENT_LINES.map((line, i) => [line.id, entries[i]]));
      setDataByLine(next);
      setIsLoadingStudy(false);
      const firstLine = CONTENT_LINES[0];
      const firstCategory = next[firstLine.id]?.[0]?.category ?? null;
      setActiveLineId(firstLine.id);
      setActiveCategoryId(firstCategory);
      setOpenLineIds(new Set([firstLine.id]));
    }
    loadAll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sentenceGeneratorEnabled) return;
    loadGeneratorFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sentenceGeneratorEnabled) return;
    loadGeneratorSentences(activeSentenceFolderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentenceGeneratorEnabled, activeSentenceFolderId]);

  const tree = useMemo(
    () =>
      toStudyTreeShape(dataByLine, { masteredByLine, openLineIds, activeLineId, activeCategoryId }),
    [dataByLine, masteredByLine, openLineIds, activeLineId, activeCategoryId]
  );

  const flatIndex = useMemo(() => buildSearchIndex(dataByLine), [dataByLine]);
  const searchResults = useMemo(() => searchIndex(flatIndex, searchQuery), [flatIndex, searchQuery]);

  if (!FEATURE_FLAGS.FEATURE_FOUNDATION_SHELL) {
    return <p>Sento — scaffold running</p>;
  }

  // Rail shows if either CMS or the Generator has a view to switch to —
  // previously gated on contentManagementEnabled alone, which would have
  // hidden the Generate entry entirely once it existed (epic 5, Section 6
  // note).
  const showIconRail = contentManagementEnabled || sentenceGeneratorEnabled;
  const visibleViews = VIEWS.filter((v) => {
    if (v.id === "cms") return contentManagementEnabled;
    if (v.id === "generate") return sentenceGeneratorEnabled;
    return true;
  });
  const showStudySidebar = studyFlashcardsEnabled && view === "study";
  const showGeneratorSidebar = sentenceGeneratorEnabled && view === "generate";

  // Approximated the same way GeneratePage previously did: exact for
  // whichever folder is currently open (activeSentenceFolderId), since
  // that's the only folder SentenceFolderTree's delete-gate can ever act
  // on (delete UI only appears for the open, empty folder). See original
  // Step 15 commit note — /sentence-folders still doesn't return counts.
  const generatorFolderCounts = Object.fromEntries(
    generatorFolders.map((f) => [
      f.id,
      f.id === activeSentenceFolderId ? generatorSentences.length : 1,
    ])
  );
  const generatorFoldersWithCounts = generatorFolders.map((f) => ({
    ...f,
    sentenceCount: generatorFolderCounts[f.id],
  }));

  function toggleLine(lineId) {
    guardNavigation(() => {
      setOpenLineIds((prev) => {
        const next = new Set(prev);
        if (next.has(lineId)) {
          next.delete(lineId);
        } else {
          next.add(lineId);
        }
        return next;
      });
    });
  }

  function selectCategory(lineId, categoryId) {
    guardNavigation(() => {
      setActiveLineId(lineId);
      setActiveCategoryId(categoryId);
      setOpenLineIds((prev) => new Set(prev).add(lineId));
    });
  }

  function handleSelectView(nextView) {
    guardNavigation(() => {
      if (nextView === view) {
        setSidebarCollapsed((prev) => !prev);
      } else {
        setView(nextView);
        setSidebarCollapsed(false);
      }
    });
  }

  function handleModeChange(nextMode) {
    guardNavigation(() => {
      setMode(nextMode);
      if (FEATURE_FLAGS.FEATURE_QUIZ_MODE) {
        setQuizPhase(nextMode === "quiz" ? "selecting" : "idle");
        setSelectedIds(new Set());
      }
    });
  }

  function handleStartQuiz() {
    setQuizPhase("active");
  }

  function handleFinishQuiz() {
    setQuizPhase("idle");
    setSelectedIds(new Set());
    setMode("study");
  }

  function handleSelectSearchResult(lineId, categoryId) {
    selectCategory(lineId, categoryId);
    setSearchQuery("");
  }

  const activeLine = CONTENT_LINES.find((l) => l.id === activeLineId);
  const activeEntries = (dataByLine[activeLineId] ?? []).filter((e) => e.category === activeCategoryId);
  const activeItems = activeLineId ? toFlashcardItems(activeLineId, activeEntries) : [];
  const activeMastered = activeLineId ? masteredByLine[activeLineId] : new Set();
  const masteredCount = activeItems.filter((item) => activeMastered.has(item.id)).length;
  const progressPct = activeItems.length > 0 ? Math.round((masteredCount / activeItems.length) * 100) : 0;

  return (
    <>
      <AppShell
        rail={
          showIconRail ? (
            <IconRail views={visibleViews} activeView={view} onSelectView={handleSelectView} />
          ) : undefined
        }
        sidebarCollapsed={sidebarCollapsed}
        sidebar={
          <>
            <div className={styles.brand}>
              <span className={styles.kanji}>N5 路線図</span>
              <span className={styles.sub}>Grammar · Kanji · Vocabulary</span>
            </div>
            <div className={styles.searchWrap}>
              <input
                type="text"
                placeholder="Search everything…"
                value={showStudySidebar ? searchQuery : ""}
                onChange={showStudySidebar ? (e) => setSearchQuery(e.target.value) : undefined}
                readOnly={!showStudySidebar}
              />
            </div>
            {showStudySidebar ? (
              searchQuery.trim() ? (
                <SearchResults results={searchResults} onSelectResult={handleSelectSearchResult} />
              ) : (
                <CategoryTree categories={tree} onToggleCategory={toggleLine} onSelectItem={selectCategory} />
              )
            ) : showGeneratorSidebar ? (
              <SentenceFolderTree
                folders={generatorFoldersWithCounts}
                activeFolderId={activeSentenceFolderId}
                onSelectFolder={setActiveSentenceFolderId}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
              />
            ) : (
              <CategoryTree categories={[]} onToggleCategory={() => {}} onSelectItem={() => {}} />
            )}
          </>
        }
      >
        {view === "cms" && contentManagementEnabled ? (
          <ContentManagementPage />
        ) : view === "study" && studyFlashcardsEnabled ? (
          <StudyPage
            activeLine={activeLine}
            activeCategoryId={activeCategoryId}
            items={activeItems}
            mastered={activeMastered}
            onToggleMastered={activeLineId ? toggleByLine[activeLineId] : () => {}}
            masteredCount={masteredCount}
            progressPct={progressPct}
            isLoading={isLoadingStudy}
            mode={mode}
            onModeChange={handleModeChange}
            quizPhase={quizPhase}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelectItem}
            onStartQuiz={handleStartQuiz}
            onFinishQuiz={handleFinishQuiz}
            generatorSelectionPhase={generatorSelectionPhase}
            generatorSelectedIds={generatorSelectedIds}
            onToggleGeneratorSelect={toggleGeneratorSelectItem}
            generatorMinSelection={GENERATOR_MIN_SELECTION}
            generatorSelectionCap={GENERATOR_SELECTION_CAP}
            onGeneratorClick={handleGeneratorClick}
            onContinueGenerator={handleContinueGenerator}
          />
        ) : view === "generate" && sentenceGeneratorEnabled ? (
          <GeneratePage
            workflowPhase={generatorWorkflowPhase}
            sourceItemRefs={generatorSourceItemRefs}
            onRunComplete={handleGeneratorRunComplete}
            folders={generatorFolders}
            sentences={generatorSentences}
            isLoadingSentences={isLoadingGeneratorSentences}
            onRelocateSentence={handleRelocateSentence}
            onDeleteSentence={handleDeleteSentence}          
          />

        ) : (
          <div className="platform-head">
            <div>
              <h1>Foundation shell — no content lines yet</h1>
            </div>
            <ModeToggle mode={mode} onModeChange={setMode} onGeneratorClick={() => {}} />
          </div>
        )}
      </AppShell>
      <ConfirmDialog
        open={pendingAction !== null}
        message={
          quizInProgress
            ? "This will end your current quiz and discard your progress. Continue?"
            : "This will discard your in-progress sentence generation run. Continue?"
        }
        onConfirm={confirmDiscardInProgress}
        onCancel={cancelPendingDiscard}
      />
    </>
  );
}

export default App;