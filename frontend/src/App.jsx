import { useEffect, useMemo, useState } from "react";
import { ADMIN_WRITES_ENABLED } from "./config/adminMode";
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
import { useQuiz } from "./hooks/useQuiz";
import { toStudyTreeShape } from "./utils/studyTreeAdapter";
import { buildSearchIndex, searchIndex } from "./utils/searchIndex";
import AppShell from "./components/layouts/AppShell";
import CategoryTree from "./components/layouts/CategoryTree";
import IconRail from "./components/layouts/IconRail";
import SentenceFolderTree from "./components/generator/SentenceFolderTree";
import SearchResults from "./components/study/SearchResults";
import QuizCard from "./components/quiz/QuizCard";
import QuizSummary from "./components/quiz/QuizSummary";
import ContentManagementPage from "./pages/ContentManagementPage";
import StudyPage from "./pages/StudyPage";
import GeneratePage from "./pages/GeneratePage";
import StartGate from "./components/common/StartGate";
import ConfirmDialog from "./components/common/ConfirmDialog";
import styles from "./styles/Sidebar.module.css";
import logo from "./assets/logo.svg";
import SoundProviders from "./context/SoundProviders";

const VIEWS = [
  { id: "study", icon: "学", label: "Study" },
  { id: "cms", icon: "文", label: "Manage Content" },
  { id: "generate", icon: "✧", label: "Generate" },
];

const FETCHERS = { kanji: getKanji, vocab: getVocab, grammar: getGrammar };

const SELECTION_CAP = 20;
// epic 6 — quiz eligibility is now global (all lines + sentences), not
// per-category, so this gates the whole pool, not one category's items.
const MIN_QUIZ_ITEMS = 4;

const GENERATOR_SELECTION_CAP = 5;
const GENERATOR_MIN_SELECTION = 2;

/**
 * Maps one line's raw entries into FlashcardCard's normalized item shape.
 * Unchanged from epic 3/5 — still used both for the active category's
 * display items AND (epic 6) as an input to the global quiz pool below,
 * called once per line over ALL of that line's entries in the latter case.
 *
 * epic 009 — `romaji` mirrors `reading` field-for-field, including inside
 * `example`. The API supplies it for every line (computed for kanji and
 * vocab, stored for grammar — ADR 015), so no transliteration happens on
 * this side; this is plumbing, not logic.
 */
function toFlashcardItems(lineId, entries) {
  if (lineId === "kanji") {
    return entries.map((e) => ({
      id: e.id,
      lineId,
      prompt: e.character,
      reading: [e.onyomi, e.kunyomi].filter(Boolean).join(", "),
      // Joined the same way `reading` is, so the two stay index-aligned
      // when both are shown — a kanji with only a kunyomi must not end up
      // with its romaji sitting under the 音 label.
      romaji: [e.onyomi_romaji, e.kunyomi_romaji].filter(Boolean).join(", "),
      onyomi: e.onyomi,
      kunyomi: e.kunyomi,
      onyomiRomaji: e.onyomi_romaji,
      kunyomiRomaji: e.kunyomi_romaji,
      answer: e.meaning_en,
      example: e.compound_word
        ? {
            jp: e.compound_word,
            reading: e.compound_reading,
            romaji: e.compound_romaji,
            en: e.compound_meaning_en,
          }
        : null,
    }));
  }
  if (lineId === "vocab") {
    return entries.map((e) => ({
      id: e.id,
      lineId,
      prompt: e.word,
      reading: e.reading ?? "",
      romaji: e.romaji ?? "",
      answer: e.meaning_en,
      example: null,
    }));
  }
  return entries.map((e) => ({
    id: e.id,
    lineId,
    prompt: e.pattern,
    reading: null,
    // Grammar's prompt is the pattern itself, so its romaji is the
    // pattern's — unlike the other two lines, where romaji describes a
    // separate reading field.
    romaji: e.pattern_romaji ?? "",
    answer: e.meaning_en,
    example: e.example_jp
      ? {
          jp: e.example_jp,
          reading: e.example_reading,
          romaji: e.example_romaji,
          en: e.example_en,
        }
      : null,
  }));
}

/**
 * Maps saved GeneratedSentence rows into the same shared quiz-item shape
 * (epic 6) — lineId "sentence" is what useQuiz's buildOptions branches on
 * to resolve distractors from source_item_refs instead of same-line peers.
 */
function toSentenceQuizItems(sentences) {
  return sentences.map((s) => ({
    id: s.id,
    lineId: "sentence",
    prompt: s.jp_text,
    reading: s.reading,
    // No romaji for saved sentences yet. A sentence needs word
    // segmentation, so it can't be transliterated from `reading` the way
    // a single kanji or vocab word can (ADR 015) — epic 009 phase 2 adds
    // it by asking the generation provider for it directly. Empty rather
    // than absent so every item in the shared quiz shape has the key.
    romaji: "",
    answer: s.meaning_en,
    example: null,
    source_item_refs: s.source_item_refs,
  }));
}

/**
 * Active-quiz view, promoted from StudyPage (epic 6) so it renders
 * regardless of which page (Study or Generate) the quiz was launched
 * from — App.jsx intercepts quizPhase === "active" above the view
 * switch, so StudyPage/GeneratePage never mount while a quiz is active.
 */
function QuizRunner({ selectedItems, globalPool, onFinish }) {
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
    />
  );
}

function App() {
  const [mode, setMode] = useState("study");
  const [view, setView] = useState("study");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);

  const [dataByLine, setDataByLine] = useState({ kanji: [], vocab: [], grammar: [] });
  const [isLoadingStudy, setIsLoadingStudy] = useState(true);
  const [openLineIds, setOpenLineIds] = useState(new Set());
  const [activeLineId, setActiveLineId] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [quizPhase, setQuizPhase] = useState("idle");
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [generatorSelectionPhase, setGeneratorSelectionPhase] = useState("idle");
  const [generatorSelectedIds, setGeneratorSelectedIds] = useState(new Set());
  const [generatorWorkflowPhase, setGeneratorWorkflowPhase] = useState("browsing");
  const [generatorSourceItemRefs, setGeneratorSourceItemRefs] = useState([]);

  const [generatorFolders, setGeneratorFolders] = useState([]);
  const [activeSentenceFolderId, setActiveSentenceFolderId] = useState(null);
  const [generatorSentences, setGeneratorSentences] = useState([]);
  const [isLoadingGeneratorSentences, setIsLoadingGeneratorSentences] = useState(true);

  // epic 6 — every saved sentence, unscoped by folder, feeding the
  // global quiz pool. Distinct from generatorSentences (the
  // folder-scoped browsing list) — different audience, different
  // refetch triggers (a folder switch shouldn't refetch this).
  const [allGeneratorSentences, setAllGeneratorSentences] = useState([]);

  const [pendingAction, setPendingAction] = useState(null);

  // epic 6 — selection now spans pages (Study + Generate) by design, so
  // only an ACTIVE quiz blocks navigation. "selecting" no longer does —
  // the user needs to browse both pages freely while building a
  // cross-page, cross-type selection before starting.
  const quizInProgress = quizPhase === "active";
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

  // Composite key "${itemType}:${itemId}" — itemType is one of
  // "kanji"/"vocab"/"grammar"/"sentence". A bare id can't disambiguate
  // its source table once selection spans every line + saved sentences.
  function makeSelectionKey(itemType, itemId) {
    return `${itemType}:${itemId}`;
  }

  function toggleSelectItem(itemType, itemId) {
    const key = makeSelectionKey(itemType, itemId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= SELECTION_CAP) return prev;
        next.add(key);
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
      // Generator's own source-item picker stays Study-page-only
      // (unchanged scope) — force the view there so this button works
      // identically whether it's clicked from Study or Generate.
      setView("study"); 
      setMode("generate");
      setGeneratorSelectionPhase("selecting");
      setGeneratorSelectedIds(new Set());
    });
  }

  function handleContinueGenerator() {
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

  function handleGeneratorRunComplete() {
    setGeneratorWorkflowPhase("browsing");
    setGeneratorSourceItemRefs([]);
    // a save just happened — the global sentence pool used for quizzing
    // needs the newly-saved rows too, not just the folder-scoped list
    getSentences().then(setAllGeneratorSentences);
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
    setAllGeneratorSentences((prev) => prev.filter((s) => s.id !== sentenceId));
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
    loadGeneratorFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadGeneratorSentences(activeSentenceFolderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSentenceFolderId]);

  useEffect(() => {
    // Unscoped — every saved sentence regardless of folder, for the
    // global quiz pool. Refreshed on save/delete (see
    // handleGeneratorRunComplete / handleDeleteSentence), not on every
    // folder switch — a relocate doesn't change which sentences exist.
    getSentences().then(setAllGeneratorSentences);
  }, []);

  const tree = useMemo(
    () =>
      toStudyTreeShape(dataByLine, { masteredByLine, openLineIds, activeLineId, activeCategoryId }),
    [dataByLine, masteredByLine, openLineIds, activeLineId, activeCategoryId]
  );

  const flatIndex = useMemo(() => buildSearchIndex(dataByLine), [dataByLine]);
  const searchResults = useMemo(() => searchIndex(flatIndex, searchQuery), [flatIndex, searchQuery]);

  // epic 6 — global, mixed-type quiz pool: every kanji/vocab/grammar
  // entry across every category, plus every saved sentence, normalized
  // into the shared quiz-item shape. No longer scoped to activeLineId/
  // activeCategoryId the way it was pre-epic-6.
  const globalQuizPool = useMemo(() => {
    const regularItems = CONTENT_LINES.flatMap((line) =>
      toFlashcardItems(line.id, dataByLine[line.id] ?? [])
    );
    return [...regularItems, ...toSentenceQuizItems(allGeneratorSentences)];
  }, [dataByLine, allGeneratorSentences]);

  const selectedQuizItems = useMemo(
    () => globalQuizPool.filter((item) => selectedIds.has(makeSelectionKey(item.lineId, item.id))),
    [globalQuizPool, selectedIds]
  );

  const canQuizGlobally = globalQuizPool.length >= MIN_QUIZ_ITEMS;

  // Study and Generate are always available. The CMS drives
  // unauthenticated write endpoints, so it stays opt-in (ADR 012).
  const visibleViews = VIEWS.filter((v) => v.id !== "cms" || ADMIN_WRITES_ENABLED);
  const showStudySidebar = view === "study";
  const showGeneratorSidebar = view === "generate";

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

  function handleStart() {
    setHasStarted(true);
    setSidebarCollapsed(false);
  }

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
      setQuizPhase(nextMode === "quiz" ? "selecting" : "idle");
      setSelectedIds(new Set());
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
    <SoundProviders>
      <StartGate hasStarted={hasStarted} onStart={handleStart} />
      <AppShell
        rail={
          <IconRail views={visibleViews} activeView={view} onSelectView={handleSelectView} />
        }
        sidebarCollapsed={sidebarCollapsed}
        contentHidden={!hasStarted}
        sidebar={
          <>
            <div className={styles.brand}>
              <img src={logo} alt="Sento" className={styles.brandLogo} />
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
                <SearchResults
                  results={searchResults}
                  query={searchQuery}
                  onSelectResult={handleSelectSearchResult}
                />
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
        {quizPhase === "active" ? (
          <QuizRunner
            selectedItems={selectedQuizItems}
            globalPool={globalQuizPool}
            onFinish={handleFinishQuiz}
          />
        ) : view === "cms" && ADMIN_WRITES_ENABLED ? (
          <ContentManagementPage />
        ) : view === "study" ? (
          <StudyPage
            activeLine={activeLine}
            activeLineId={activeLineId}
            activeCategoryId={activeCategoryId}
            items={activeItems}
            mastered={activeMastered}
            onToggleMastered={activeLineId ? toggleByLine[activeLineId] : () => {}}
            masteredCount={masteredCount}
            progressPct={progressPct}
            isLoading={isLoadingStudy}
            mode={mode}
            onModeChange={handleModeChange}
            canQuiz={canQuizGlobally}
            quizPoolSize={globalQuizPool.length}
            quizPhase={quizPhase}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelectItem}
            onStartQuiz={handleStartQuiz}
            generatorSelectionPhase={generatorSelectionPhase}
            generatorSelectedIds={generatorSelectedIds}
            onToggleGeneratorSelect={toggleGeneratorSelectItem}
            generatorMinSelection={GENERATOR_MIN_SELECTION}
            generatorSelectionCap={GENERATOR_SELECTION_CAP}
            onGeneratorClick={handleGeneratorClick}
            onContinueGenerator={handleContinueGenerator}
          />
        ) : view === "generate" ? (
          <GeneratePage
            workflowPhase={generatorWorkflowPhase}
            sourceItemRefs={generatorSourceItemRefs}
            onRunComplete={handleGeneratorRunComplete}
            folders={generatorFolders}
            sentences={generatorSentences}
            isLoadingSentences={isLoadingGeneratorSentences}
            onRelocateSentence={handleRelocateSentence}
            onDeleteSentence={handleDeleteSentence}
            mode={mode}
            onModeChange={handleModeChange}
            canQuiz={canQuizGlobally}
            quizPoolSize={globalQuizPool.length}
            quizPhase={quizPhase}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelectItem}
            onStartQuiz={handleStartQuiz}
            generatorSelectionPhase={generatorSelectionPhase}
            generatorSelectedIds={generatorSelectedIds}
            generatorMinSelection={GENERATOR_MIN_SELECTION}
            generatorSelectionCap={GENERATOR_SELECTION_CAP}
            onGeneratorClick={handleGeneratorClick}
            onContinueGenerator={handleContinueGenerator}
          />
        ) : (
          // Only reachable if `view` is "cms" while admin writes are
          // off, which the rail already prevents — kept as a guard so a
          // stale view id renders a message rather than nothing.
          <div className="platform-head">
            <div>
              <h1>That view isn’t available.</h1>
            </div>
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
    </SoundProviders>
  );
}

export default App;