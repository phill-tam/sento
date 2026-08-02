import { useState } from "react";
import { FEATURE_FLAGS } from "./config/featureFlags";
import AppShell from "./components/layouts/AppShell";
import ModeToggle from "./components/layouts/ModeToggle";
import CategoryTree from "./components/layouts/CategoryTree";
import IconRail from "./components/layouts/IconRail";
import ContentManagementPage from "./pages/ContentManagementPage";
import styles from "./styles/Sidebar.module.css";

const VIEWS = [
  { id: "study", icon: "学", label: "Study" },
  { id: "cms", icon: "文", label: "Manage Content" },
];

function App() {
  const [mode, setMode] = useState("study");
  const [view, setView] = useState("study");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!FEATURE_FLAGS.FEATURE_FOUNDATION_SHELL) {
    return <p>Sento — scaffold running</p>;
  }

  // CMS is rendered inside AppShell — it has no shell of its own, so it can
  // only ever be reachable when FOUNDATION_SHELL is also on. This flag stays
  // independent (not folded into FOUNDATION_SHELL) per epic 002's naming
  // convention (ADR 005) — only its *effect* is gated here.
  const contentManagementEnabled = FEATURE_FLAGS.FEATURE_CONTENT_MANAGEMENT;
  const visibleViews = contentManagementEnabled ? VIEWS : VIEWS.filter((v) => v.id === "study");

  function handleSelectView(nextView) {
    if (nextView === view) {
      // pressing the icon for the currently active view collapses the sidebar
      setSidebarCollapsed((prev) => !prev);
    } else {
      // switching views re-expands the sidebar if it was collapsed
      setView(nextView);
      setSidebarCollapsed(false);
    }
  }

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
            <input type="text" placeholder="Search everything…" />
          </div>
          <CategoryTree
            categories={[]}
            onToggleCategory={() => {}}
            onSelectItem={() => {}}
          />
        </>
      }
    >
      {view === "cms" && contentManagementEnabled ? (
        <ContentManagementPage />
      ) : (
        <div className="platform-head">
          <div>
            <h1>Foundation shell — no content lines yet</h1>
          </div>
          <ModeToggle
            mode={mode}
            onModeChange={setMode}
            onGeneratorClick={() => {}}
          />
        </div>
      )}
    </AppShell>
  );
}

export default App;