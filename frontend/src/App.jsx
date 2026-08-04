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
import styles from "./styles/Sidebar.module.css";

const VIEWS = [
  { id: "study", icon: "学", label: "Study" },
  { id: "cms", icon: "文", label: "Manage Content" },
];

const FETCHERS = { kanji: getKanji, vocab: getVocab, grammar: getGrammar };

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

  // Study state, lifted from StudyPage.jsx — App.jsx owns this because the
  // real sidebar's search input and CategoryTree need it too, and both
  // live here, not inside StudyPage.
  const [dataByLine, setDataByLine] = useState({ kanji: [], vocab: [], grammar: [] });
  const [isLoadingStudy, setIsLoadingStudy] = useState(true);
  const [openLineIds, setOpenLineIds] = useState(new Set());
  const [activeLineId, setActiveLineId] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
 
  const [quizPhase, setQuizPhase] = useState("idle");
  const [selectedIds, setSelectedIds] = useState(new Set())
  
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

  const visibleViews = contentManagementEnabled ? VIEWS : VIEWS.filter((v) => v.id === "study");
  const showStudySidebar = studyFlashcardsEnabled && view === "study";

  function handleSelectView(nextView) {
    if (nextView === view) {
      setSidebarCollapsed((prev) => !prev);
    } else {
      setView(nextView);
      setSidebarCollapsed(false);
    }
  }

  function toggleLine(lineId) {
    setOpenLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  }

  function toggleSelectItem(itemId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  // Replaces the bare `setMode` previously passed to StudyPage — switching
  // into "quiz" starts the selecting phase with a clean slate; switching
  // back to "study" clears it. Navigation-guard check (Step 12) wraps this
  // later; for now it always proceeds.
  function handleModeChange(nextMode) {
    setMode(nextMode);
    setQuizPhase(nextMode === "quiz" ? "selecting" : "idle");
    setSelectedIds(new Set());
  }

  function handleStartQuiz() {
    setQuizPhase("active");
  }

  function selectCategory(lineId, categoryId) {
    setActiveLineId(lineId);
    setActiveCategoryId(categoryId);
    setOpenLineIds((prev) => new Set(prev).add(lineId));
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
    <AppShell
      rail={
        contentManagementEnabled ? (
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
  );
}

export default App;