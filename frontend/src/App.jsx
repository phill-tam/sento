import { useState } from "react";
import { FEATURE_FLAGS } from "./config/featureFlags";
import AppShell from "./components/layouts/AppShell";
import ModeToggle from "./components/layouts/ModeToggle";
import CategoryTree from "./components/layouts/CategoryTree";
import styles from "./styles/Sidebar.module.css";

function App() {
  const [mode, setMode] = useState("study");

  if (!FEATURE_FLAGS.FEATURE_FOUNDATION_SHELL) {
    return <p>Sento — scaffold running</p>;
  }

  // CMS is rendered inside AppShell — it has no shell of its own, so it can
  // only ever be reachable when FOUNDATION_SHELL is also on. This flag stays
  // independent (not folded into FOUNDATION_SHELL) per epic 002's naming
  // convention (ADR 005) — only its *effect* is gated here.
  const contentManagementEnabled = FEATURE_FLAGS.FEATURE_CONTENT_MANAGEMENT;

  return (
    <AppShell
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
    </AppShell>
  );
}

export default App;