import { useEffect, useState } from "react";
import ContentLineDropdown from "../components/cms/ContentLineDropdown";
import CsvUploadCard from "../components/cms/CsvUploadCard";
import UploadResultsList from "../components/cms/UploadResultsList";
import CategoryTree from "../components/layouts/CategoryTree";
import { toCategoryTreeShape } from "../utils/contentTreeAdapter";
import {
  getGrammar,
  getKanji,
  getVocab,
  uploadGrammarCsv,
  uploadKanjiCsv,
  uploadVocabCsv,
} from "../api";
import styles from "../styles/ContentManagementPage.module.css";

const FETCHERS = { kanji: getKanji, vocab: getVocab, grammar: getGrammar };
const UPLOADERS = { kanji: uploadKanjiCsv, vocab: uploadVocabCsv, grammar: uploadGrammarCsv };

export default function ContentManagementPage() {
  const [activeLine, setActiveLine] = useState("kanji");
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [openCategoryIds, setOpenCategoryIds] = useState(new Set());
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [activeItemId, setActiveItemId] = useState(null);

  async function refreshEntries() {
    setIsLoading(true);
    try {
      // status: "all" — this is an authoring view, not the approved-only
      // learner-facing surface, so drafts must be visible to be reviewable.
      const data = await FETCHERS[activeLine]({ status: "all" });
      setEntries(data);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshEntries();
    setOpenCategoryIds(new Set());
    setActiveCategoryId(null);
    setActiveItemId(null);
    setUploadResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLine]);

  function handleUploadResult(result) {
    setUploadResult(result);
    if (result && result.success_count > 0) {
      refreshEntries();
    }
  }

  function toggleCategory(categoryId) {
    setOpenCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

  function selectItem(categoryId, itemId) {
    setActiveCategoryId(categoryId);
    setActiveItemId(itemId);
  }

  const categories = toCategoryTreeShape(entries, activeLine, {
    openCategoryIds,
    activeCategoryId,
    activeItemId,
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Manage Content</h1>
        <ContentLineDropdown activeLine={activeLine} onSelectLine={setActiveLine} />
      </div>

      <CsvUploadCard onUpload={UPLOADERS[activeLine]} onResult={handleUploadResult} />
      <UploadResultsList result={uploadResult} />

      <div className={styles.treeSection}>
        {isLoading ? (
          <p className={styles.loading}>Loading…</p>
        ) : (
          <CategoryTree
            categories={categories}
            onToggleCategory={toggleCategory}
            onSelectItem={selectItem}
          />
        )}
      </div>
    </div>
  );
}