/**
 * Which flashcard layout a category gets (epic 010).
 *
 * An explicit table, not a measurement of the rendered text. Measuring
 * self-maintains, but it can only run after a first paint — so the
 * layout it picks arrives as a shift — and "why is this category a
 * list?" stops having an answer anyone can read. A table someone can
 * open and check was the deliberate trade; see ADR 016 before replacing
 * it with a heuristic, which has already been considered and rejected.
 *
 * The shape is a per-line default plus named exceptions, because that
 * is how the content actually divides: grammar patterns are phrases and
 * overflow a tile as a rule, with a few short fixed-form categories that
 * never will; vocab is single words apart from `greetings`, whose
 * よろしくおねがいします cramps a tile with or without romaji.
 *
 * Accepted cost: this needs updating when a category is added, and a
 * long pattern uploaded into one of the grammar exceptions overflows
 * until someone notices.
 */
const LAYOUTS = {
  grammar: {
    default: "list",
    // Short, fixed-form entries that will never outgrow a tile.
    exceptions: { particles: "grid", counters: "grid", conditionals: "grid" },
  },
  vocab: {
    default: "grid",
    exceptions: { greetings: "list" },
  },
  kanji: {
    default: "grid",
    exceptions: {},
  },
};

const FALLBACK = "grid";

/**
 * layoutForCategory(lineId, categoryId) -> "grid" | "list"
 *
 * No category selected, or a line this table doesn't know, falls back to
 * the tile grid — the layout every category had before this epic.
 *
 * A category the table doesn't list resolves to its *line's* default
 * rather than to that fallback, which matters in one direction only: a
 * grammar category added later is long until proven otherwise, and
 * quietly handing it the tile layout would reintroduce exactly the
 * overflow this epic exists to fix.
 */
export function layoutForCategory(lineId, categoryId) {
  if (!categoryId) return FALLBACK;

  const line = LAYOUTS[lineId];
  if (!line) return FALLBACK;

  return line.exceptions[categoryId] ?? line.default;
}
