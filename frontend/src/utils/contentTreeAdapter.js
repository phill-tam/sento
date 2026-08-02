/**
 * Maps Kanji/Vocab/Grammar API responses into CategoryTree's generic shape
 * (epic 001, ADR 003): { id, label, labelJp, icon, count, total, complete }
 * per category, same shape per item nested inside.
 *
 * "complete" here is an authoring concept (all entries in a category are
 * status=approved) — not the learner-facing mastery tracking, which is a
 * separate, still-to-be-defined concept per epic 001's resolved open question.
 */

const LINE_ICONS = {
  kanji: "漢",
  vocab: "語",
  grammar: "文",
};

const JP_FIELD_BY_LINE = {
  kanji: "character",
  vocab: "word",
  grammar: "pattern",
};

/**
 * entries: flat list from getKanji/getVocab/getGrammar
 * line: "kanji" | "vocab" | "grammar"
 * openCategoryIds / activeCategoryId / activeItemId: UI state owned by the
 * caller (ContentManagementPage), passed through so this stays a pure mapper.
 */
export function toCategoryTreeShape(entries, line, { openCategoryIds = new Set(), activeCategoryId, activeItemId } = {}) {
  const jpField = JP_FIELD_BY_LINE[line];
  const icon = LINE_ICONS[line];

  const byCategory = new Map();
  for (const entry of entries) {
    if (!byCategory.has(entry.category)) {
      byCategory.set(entry.category, []);
    }
    byCategory.get(entry.category).push(entry);
  }

  return Array.from(byCategory.entries()).map(([category, categoryEntries]) => {
    const approvedCount = categoryEntries.filter((e) => e.status === "approved").length;

    return {
      id: category,
      label: category,
      labelJp: category,
      icon,
      count: approvedCount,
      total: categoryEntries.length,
      open: openCategoryIds.has(category),
      active: activeCategoryId === category,
      complete: approvedCount === categoryEntries.length,
      items: categoryEntries.map((entry) => ({
        id: entry.id,
        label: entry.meaning_en,
        labelJp: entry[jpField],
        icon,
        count: entry.status === "approved" ? 1 : 0,
        total: 1,
        active: activeItemId === entry.id,
        complete: entry.status === "approved",
      })),
    };
  });
}