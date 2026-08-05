import { useEffect, useMemo, useState } from "react";
import { FEATURE_FLAGS } from "./config/featureFlags";
import { getGrammar, getKanji, getVocab } from "./api";
import { CONTENT_LINES } from "./constants/contentLines";
import { useMastered } from "./hooks/useMastered";
import { toStudyTreeShape } from "./utils/studyTreeAdapter";
import { buildSearchIndex, searchIndex } from "./utils/searchIndex";
import AppShell from "./components/layouts/AppShell";
import ModeToggle from "./components/layouts/ModeToggle";
import CategoryTree from "./components/layouts/CategoryTree";
import IconRail from "./components/layouts/IconRail";
import SearchResults from "./components/study/SearchResults";
import ContentManagementPage from "./pages/ContentManagementPage";
import StudyPage from "./pages/StudyPage";
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

  // holds a closure for whatever navigation action triggered the confirm
  // dialog — null means the dialog is closed.
  const [pendingAction, setPendingAction] = useState(null);

  const quizInProgress = quizPhase === "selecting" || quizPhase === "active";

  function guardNavigation(action) {
    if (quizInProgress) {
      setPendingAction(() => action);
    } else {
      action();
    }
  }

  function confirmDiscardQuiz() {
    setQuizPhase("idle");
    setSelectedIds(new Set());
    setMode("study");
    const action = pendingAction;
    setPendingAction(null);
    if (action) action();
  }

  function cancelDiscardQuiz() {
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
          />
        ) : view === "generate" && sentenceGeneratorEnabled ? (
          // TODO(Step 15): replace with the real GeneratePage, wired to
          // useSentenceGenerator and the generator state added next commit.
          <div className="platform-head">
            <h1>Sentence Generator</h1>
            <p>Coming soon.</p>
          </div>
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
        message="This will end your current quiz and discard your progress. Continue?"
        onConfirm={confirmDiscardQuiz}
        onCancel={cancelDiscardQuiz}
      />
    </>
  );
}

export default App;