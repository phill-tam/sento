import { CONTENT_LINES } from "../constants/contentLines";
import { getCategoryIcon } from "../constants/categoryIcons";

function formatCategoryLabel(categoryId) {
  return categoryId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Maps all three content lines' GET responses into CategoryTree's two-level
 * shape (epic 001, ADR 003), with lines as the top-level "folder" nodes and
 * each line's real seed-data categories as the "station" children — one
 * level deeper than epic 002's contentTreeAdapter.js, which stops at
 * category level since the CMS switches lines via a dropdown, not a tree.
 *
 * dataByLine: { kanji: Entry[], vocab: Entry[], grammar: Entry[] }
 * masteredByLine: { kanji: Set<id>, vocab: Set<id>, grammar: Set<id> } —
 * from useMastered (step 5). count/complete here are STUDY progress
 * (entries the learner marked mastered), not the CMS's approval status.
 *
 * Category ids repeat across lines (e.g. "time" in both kanji and vocab) —
 * safe here because items are scoped per-line inside this map, and
 * CategoryTree's onSelectItem(lineId, categoryId) callback keeps both
 * together downstream, so StudyPage never compares bare category ids
 * across lines.
 */
export function toStudyTreeShape(
  dataByLine,
  {
    masteredByLine = { kanji: new Set(), vocab: new Set(), grammar: new Set() },
    openLineIds = new Set(),
    activeLineId,
    activeCategoryId,
  } = {}
) {
  return CONTENT_LINES.map((line) => {
    const entries = dataByLine[line.id] ?? [];
    const mastered = masteredByLine[line.id] ?? new Set();

    const byCategory = new Map();
    for (const entry of entries) {
      if (!byCategory.has(entry.category)) {
        byCategory.set(entry.category, []);
      }
      byCategory.get(entry.category).push(entry);
    }

    const items = Array.from(byCategory.entries()).map(([categoryId, categoryEntries]) => {
      const masteredCount = categoryEntries.filter((e) => mastered.has(e.id)).length;
      return {
        id: categoryId,
        label: formatCategoryLabel(categoryId),
        labelJp: "",
        icon: getCategoryIcon(line.id, categoryId),
        count: masteredCount,
        total: categoryEntries.length,
        active: activeLineId === line.id && activeCategoryId === categoryId,
        complete: categoryEntries.length > 0 && masteredCount === categoryEntries.length,
      };
    });

    const lineMasteredTotal = items.reduce((sum, item) => sum + item.count, 0);
    const lineEntryTotal = entries.length;

    return {
      id: line.id,
      label: line.label,
      labelJp: line.labelJp,
      icon: line.icon,
      count: lineMasteredTotal,
      total: lineEntryTotal,
      open: openLineIds.has(line.id),
      active: activeLineId === line.id,
      complete: lineEntryTotal > 0 && lineMasteredTotal === lineEntryTotal,
      items,
    };
  });
}