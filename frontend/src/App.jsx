import { useEffect, useMemo, useState } from "react";
import { ADMIN_WRITES_ENABLED } from "./config/adminMode";
import { getGrammar, getKanji, getVocab } from "./api";
// Saved sentences and folders live in the user's browser, not the
// server's tables (epic 013) — but only sentenceStore.js knows that.
import {
  createSentenceFolder,
  deleteSentence,
  deleteSentenceFolder,
  getSentenceFolders,
  getSentences,
  moveSentence,
  renameSentenceFolder,
} from "./sentenceStore";
import { CONTENT_LINES } from "./constants/contentLines";
import { useMastered } from "./hooks/useMastered";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useQuiz } from "./hooks/useQuiz";
import { toStudyTreeShape } from "./utils/studyTreeAdapter";
import { buildSearchIndex, searchIndex } from "./utils/searchIndex";
import AppShell from "./components/layouts/AppShell";
import CategoryTree from "./components/layouts/CategoryTree";
import IconRail from "./components/layouts/IconRail";
import TopBarSearch from "./components/layouts/TopBarSearch";
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

// epic 011 — MUST match the @media block in AppShell.module.css. There
// is no build step that could share one value between the stylesheet and
// here, so the duplication is deliberate and the two have to be changed
// together. See useMediaQuery's docblock for why any of this is in JS.
const NARROW_LAYOUT_QUERY = "(max-width: 1024px)";

const SELECTION_CAP = 20;
// epic 6 — quiz eligibility is now global (all lines + sentences), not
// per-category, so this gates the whole pool, not one category's items.
const MIN_QUIZ_ITEMS = 4;

const GENERATOR_SELECTION_CAP = 5;
const GENERATOR_MIN_SELECTION = 2;

// Module-level so their identity is stable across renders — `selectedIds`
// and `generatorSelectedIds` are derived below and feed useMemo
// dependency arrays, which a fresh `new Set()` per render would defeat.
// Never mutated: every toggle builds a new Set.
const NO_SELECTION_IDS = new Set();
const NO_SELECTION = { kind: null, ids: NO_SELECTION_IDS };

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
    // Supplied by the generation provider, not transliterated here — a
    // sentence needs word segmentation (ADR 015). Null for anything saved
    // before epic 009 phase 2, which can never be backfilled, so this
    // stays conditional at every render site.
    romaji: s.romaji ?? "",
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
function QuizRunner({ selectedItems, globalPool, onFinish, onQuit }) {
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

function App() {
  const [mode, setMode] = useState("study");
  const [view, setView] = useState("study");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);

  // epic 011 — below the breakpoint the sidebar is an overlay drawer.
  // There is no second piece of state for it: `sidebarCollapsed` means
  // "closed drawer" down here and "hidden sidebar" up there, and this
  // flag is only what decides which of the two it means.
  const isNarrow = useMediaQuery(NARROW_LAYOUT_QUERY);

  const [dataByLine, setDataByLine] = useState({ kanji: [], vocab: [], grammar: [] });
  const [isLoadingStudy, setIsLoadingStudy] = useState(true);
  const [openLineIds, setOpenLineIds] = useState(new Set());
  const [activeLineId, setActiveLineId] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ONE picker at a time, enforced by the shape rather than by remembering
  // to clear the other one. `kind` names whose selection this is; entering
  // any picker replaces the whole object, so there is no second set left
  // behind to go stale. Before this there were two independent
  // phase+ids pairs and exclusivity was hand-written into each entry point
  // (163b9b4) — two pickers needed two clears, and a third would have
  // needed six.
  const [selection, setSelection] = useState(NO_SELECTION);

  // Whether a quiz is actually RUNNING, which is all this ever meant once
  // selection moved out of it: "idle" | "active".
  const [quizRunPhase, setQuizRunPhase] = useState("idle");

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
  // Derived so every child keeps the exact prop contract it already had —
  // this refactor is contained to this file. `selection.kind` stays "quiz"
  // through the active run, which is what keeps selectedQuizItems
  // populated after Start.
  const selectedIds = selection.kind === "quiz" ? selection.ids : NO_SELECTION_IDS;
  const generatorSelectedIds =
    selection.kind === "generator" ? selection.ids : NO_SELECTION_IDS;
  const quizPhase =
    quizRunPhase === "active" ? "active" : selection.kind === "quiz" ? "selecting" : "idle";
  const generatorSelectionPhase = selection.kind === "generator" ? "selecting" : "idle";

  const quizInProgress = quizRunPhase === "active";
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
    clearSelection();
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

  // Split on the FIRST colon only. Line ids are colon-free, but the id
  // half is opaque to this function and splitting on every colon would
  // corrupt any id that ever contains one.
  function splitSelectionKey(key) {
    const boundary = key.indexOf(":");
    return [key.slice(0, boundary), key.slice(boundary + 1)];
  }

  // Entering a picker REPLACES the selection rather than clearing a
  // sibling. That is the whole point of the unified shape: exclusivity
  // can't be forgotten because there is nowhere for a second selection to
  // survive.
  function beginSelection(kind) {
    setSelection({ kind, ids: new Set() });
    setQuizRunPhase("idle");
  }

  function clearSelection() {
    setSelection(NO_SELECTION);
    setQuizRunPhase("idle");
  }

  // One toggle for both pickers, parameterised by which picker is asking
  // and its own cap. The `kind` guard means a card left rendered by a
  // picker that has since been replaced cannot write into the new one.
  function toggleSelectionItem(kind, cap, itemType, itemId) {
    const key = makeSelectionKey(itemType, itemId);
    setSelection((prev) => {
      if (prev.kind !== kind) return prev;
      const next = new Set(prev.ids);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= cap) return prev;
        next.add(key);
      }
      return { kind, ids: next };
    });
  }

  function toggleSelectItem(itemType, itemId) {
    toggleSelectionItem("quiz", SELECTION_CAP, itemType, itemId);
  }

  // Keyed the same way as the quiz's set, and for the same reason: the
  // picker does not close when the learner changes category, so a
  // selection can span content lines and a bare id can no longer say
  // which table it came from.
  function toggleGeneratorSelectItem(itemType, itemId) {
    toggleSelectionItem("generator", GENERATOR_SELECTION_CAP, itemType, itemId);
  }

  function handleGeneratorClick() {
    guardNavigation(() => {
      // Generator's own source-item picker stays Study-page-only
      // (unchanged scope) — force the view there so this button works
      // identically whether it's clicked from Study or Generate.
      setView("study");
      setMode("generate");
      // Any quiz selection goes with it — see beginSelection.
      beginSelection("generator");
    });
  }

  function handleContinueGenerator() {
    // Each key carries the line its item came from, so the ref is built
    // from the key rather than from whatever category is open now. This
    // used to read `line_id: activeLineId` for every id at once: selecting
    // two vocab items, switching to the kanji line and pressing Continue
    // sent both vocab ids labelled "kanji", and _resolve_source_items 404s
    // the whole run. Nothing clears the selection on a category change and
    // generator selection deliberately does not block navigation (epic 6),
    // so the two could disagree freely.
    const refs = [...generatorSelectedIds].map((key) => {
      const [lineId, itemId] = splitSelectionKey(key);
      return { line_id: lineId, item_id: itemId };
    });
    setGeneratorSourceItemRefs(refs);
    clearSelection();
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
  // Memoised because `tree` below depends on it. As a bare object
  // literal this was a new reference on every render, so that useMemo
  // never actually memoised anything — toStudyTreeShape re-ran on every
  // keystroke in search, every flip, every mode change. The three Sets
  // are replaced by useMastered whenever an item is toggled, so identity
  // still changes exactly when the tree's counts need to.
  const masteredByLine = useMemo(
    () => ({
      kanji: kanjiMastered.mastered,
      vocab: vocabMastered.mastered,
      grammar: grammarMastered.mastered,
    }),
    [kanjiMastered.mastered, vocabMastered.mastered, grammarMastered.mastered]
  );
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

  // Crossing DOWN into the narrow layout closes the drawer. A drawer
  // that is already open when it becomes an overlay would be covering
  // the content the learner came for. Crossing up is left alone: an
  // expanded desktop sidebar is the normal state, and a collapsed one is
  // a state the desktop toggle can reach anyway.
  useEffect(() => {
    if (isNarrow) setSidebarCollapsed(true);
  }, [isNarrow]);

  function handleStart() {
    setHasStarted(true);
    // Open on desktop as before; stay closed below the breakpoint.
    setSidebarCollapsed(isNarrow);
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
        // Desktop reveals the new view's sidebar. Narrow keeps the
        // drawer out of the way, so the view you just asked for is what
        // you actually see. This is NOT the auto-close that decision 2
        // rules out — that one is about picking a category *within* the
        // current tree, which deliberately leaves the drawer open.
        setSidebarCollapsed(isNarrow);
      }
    });
  }

  function handleModeChange(nextMode) {
    guardNavigation(() => {
      setMode(nextMode);
      // Leaving for Study drops whichever picker was open, so a counter
      // can't survive a mode it no longer belongs to. That used to be four
      // setters and a comment explaining why two of them were
      // unconditional.
      if (nextMode === "quiz") {
        beginSelection("quiz");
      } else {
        clearSelection();
      }
    });
  }

  // Backing out of either picker is exactly "go back to Study", which
  // already clears both phases and both selections. Delegating rather
  // than repeating that reset keeps the two from drifting apart if
  // either phase grows more state later.
  function handleCancelSelection() {
    handleModeChange("study");
  }

  function handleStartQuiz() {
    setQuizRunPhase("active");
  }

  // Quitting reuses the discard confirmation that navigating away already
  // triggers, rather than adding a second dialog that says the same
  // thing. guardNavigation opens it precisely because a quiz is active,
  // and confirmDiscardInProgress is what tears the quiz down — so there
  // is no follow-up action to run here. The point is the confirmation,
  // not a destination.
  function handleQuitQuiz() {
    guardNavigation(() => {});
  }

  function handleFinishQuiz() {
    clearSelection();
    setMode("study");
  }

  function handleSelectSearchResult(lineId, categoryId) {
    selectCategory(lineId, categoryId);
    setSearchQuery("");
  }

  // epic 011 — below the breakpoint the field is in the top bar but the
  // RESULTS still render in the sidebar, which is now a drawer. A query
  // typed against a closed drawer would have nowhere to show, so a
  // non-empty one opens it. Closing is left to the usual controls: this
  // deliberately does not re-close the drawer when the query empties,
  // for the same reason picking a category does not.
  function handleSearchQueryChange(next) {
    setSearchQuery(next);
    if (isNarrow && next.trim()) setSidebarCollapsed(false);
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
          <IconRail
            views={visibleViews}
            activeView={view}
            onSelectView={handleSelectView}
            sidebarCollapsed={sidebarCollapsed}
            // Passing these two is how the rail is told it is a top bar
            // right now; above the breakpoint they are undefined and it
            // renders exactly the DOM it did before this epic.
            onToggleSidebar={isNarrow ? () => setSidebarCollapsed((prev) => !prev) : undefined}
            // Rendered here or in the sidebar, never both — see
            // TopBarSearch's docblock. Same value, same handler, same
            // readOnly rule as the sidebar field it replaces, so this is
            // a relocation and not a behaviour change.
            search={
              isNarrow ? (
                <TopBarSearch
                  value={showStudySidebar ? searchQuery : ""}
                  onChange={handleSearchQueryChange}
                  readOnly={!showStudySidebar}
                />
              ) : undefined
            }
            // Same one-instance rule as the search: below the breakpoint
            // the brand is in the bar, above it it's atop the sidebar.
            // Passed unclassed so IconRail can size it for the bar —
            // Sidebar's .brandLogo is 60px tall, which is taller than the
            // bar itself.
            brand={isNarrow ? <img src={logo} alt="Sento" /> : undefined}
          />
        }
        sidebarCollapsed={sidebarCollapsed}
        // Same signal for the shell: present means "the sidebar is a
        // drawer", which is what turns on the scrim, the close arrow,
        // Escape and the modal focus handling.
        onDismissSidebar={isNarrow ? () => setSidebarCollapsed(true) : undefined}
        contentHidden={!hasStarted}
        sidebar={
          <>
            {/* epic 011 — desktop only. Below the breakpoint the mark is
                in the top bar instead (see `brand` above). The subtitle
                doesn't come with it: it is 26 characters of letterspaced
                caps against a bar that is already five controls wide, and
                a lone subtitle left behind in the drawer would be a
                caption with nothing to caption. */}
            {!isNarrow && (
              <div className={styles.brand}>
                <img src={logo} alt="Sento" className={styles.brandLogo} />
                <span className={styles.sub}>Grammar · Kanji · Vocabulary</span>
              </div>
            )}
            {/* epic 011 — above the breakpoint only. Below it the same
                field lives in the top bar instead (TopBarSearch), so
                that the app's one cross-line control is not buried
                inside a per-line drawer. Desktop markup is untouched. */}
            {!isNarrow && (
              <div className={styles.searchWrap}>
                <input
                  type="text"
                  placeholder="Search everything…"
                  value={showStudySidebar ? searchQuery : ""}
                  onChange={showStudySidebar ? (e) => setSearchQuery(e.target.value) : undefined}
                  readOnly={!showStudySidebar}
                />
              </div>
            )}
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
            onQuit={handleQuitQuiz}
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
            onCancelSelection={handleCancelSelection}
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
            onCancelSelection={handleCancelSelection}
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