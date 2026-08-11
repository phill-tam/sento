import { CONTENT_LINES } from "../../constants/contentLines";
import styles from "../../styles/SearchResults.module.css";

const LINE_LOOKUP = Object.fromEntries(CONTENT_LINES.map((line) => [line.id, line]));

/**
 * Flat filtered result rows from searchIndex() (step 4) — no grouping by
 * line/category, that's the tree's job. Each row carries a line chip since
 * the same query can match across kanji/vocab/grammar simultaneously
 * (e.g. "school" matches vocab's 学校 entry and grammar's school-related
 * examples).
 *
 * results: ReturnType<typeof searchIndex> — {id, lineId, categoryId, prompt, reading, romaji, answer}[]
 * onSelectResult: (lineId, categoryId) => void — same (lineId, categoryId)
 * pair CategoryTree.onSelectItem already passes, so StudyPage can reuse
 * one selection handler for both the tree and search.
 */
export default function SearchResults({ results, query = "", onSelectResult }) {
  if (results.length === 0) {
    return <p className={styles.empty}>No matches.</p>;
  }

  // Show the romaji only when it's what the query actually hit, rather
  // than on every row. A romaji search otherwise returns rows with no
  // visible reason for matching; a kana or English search doesn't need
  // the extra column and shouldn't get it. Independent of the
  // `sento:romaji` display preference — this is match provenance, not
  // a reading aid.
  const q = query.trim().toLowerCase();
  const matchedOnRomaji = (row) =>
    q.length > 0 &&
    row.romaji.toLowerCase().includes(q) &&
    !row.prompt.toLowerCase().includes(q) &&
    !row.reading.toLowerCase().includes(q);

  return (
    <ul className={styles.list}>
      {results.map((row) => {
        const line = LINE_LOOKUP[row.lineId];
        return (
          <li
            key={`${row.lineId}-${row.id}`}
            className={styles.row}
            onClick={() => onSelectResult(row.lineId, row.categoryId)}
          >
            <span className={styles.lineChip}>{line?.icon}</span>
            <span className={styles.prompt}>{row.prompt}</span>
            {row.reading && <span className={styles.reading}>{row.reading}</span>}
            {matchedOnRomaji(row) && (
              <span className={styles.romaji}>{row.romaji}</span>
            )}
            <span className={styles.answer}>{row.answer}</span>
          </li>
        );
      })}
    </ul>
  );
}