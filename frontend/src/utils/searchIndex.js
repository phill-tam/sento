/**
 * Flattens all three lines' differently-shaped entries into one normalized
 * {id, prompt, reading, romaji, answer, lineId, categoryId} record per
 * entry, then filters by substring match — powers the sidebar search input
 * (built in epic 001, inert until now).
 *
 * Field mapping is line-specific since kanji/vocab/grammar entries don't
 * share a schema: kanji uses character/onyomi+kunyomi, vocab uses
 * word/reading, grammar uses pattern/example_reading. meaning_en is the
 * one field all three share, so it's always the "answer".
 */
const PROMPT_FIELD_BY_LINE = {
  kanji: "character",
  vocab: "word",
  grammar: "pattern",
};

function readingFor(lineId, entry) {
  if (lineId === "kanji") {
    return [entry.onyomi, entry.kunyomi].filter(Boolean).join(", ");
  }
  if (lineId === "vocab") {
    return entry.reading ?? "";
  }
  return entry.example_reading ?? "";
}

/**
 * epic 009 — mirrors readingFor field-for-field, so a romaji query matches
 * exactly what a kana query would.
 *
 * Grammar is the one line that doesn't mirror: readingFor returns the
 * *example's* reading, but pattern_romaji describes the pattern itself,
 * which is the text actually shown as the result row's prompt. Both are
 * included so either matches.
 */
function romajiFor(lineId, entry) {
  if (lineId === "kanji") {
    return [entry.onyomi_romaji, entry.kunyomi_romaji].filter(Boolean).join(", ");
  }
  if (lineId === "vocab") {
    return entry.romaji ?? "";
  }
  return [entry.pattern_romaji, entry.example_romaji].filter(Boolean).join(" ");
}

/**
 * dataByLine: { kanji: Entry[], vocab: Entry[], grammar: Entry[] }
 * Returns the full flat index — call once per data load, not per keystroke.
 */
export function buildSearchIndex(dataByLine) {
  const index = [];
  for (const [lineId, entries] of Object.entries(dataByLine)) {
    const promptField = PROMPT_FIELD_BY_LINE[lineId];
    for (const entry of entries) {
      index.push({
        id: entry.id,
        lineId,
        categoryId: entry.category,
        prompt: entry[promptField] ?? "",
        reading: readingFor(lineId, entry),
        romaji: romajiFor(lineId, entry),
        answer: entry.meaning_en ?? "",
      });
    }
  }
  return index;
}

/**
 * Case-insensitive substring match across prompt/reading/romaji/answer.
 * Empty/whitespace-only query returns an empty array, not the full index —
 * SearchResults (step 8) should only render once there's an actual query.
 *
 * epic 009 — romaji is matched unconditionally, regardless of the
 * `sento:romaji` display preference. That preference decides whether
 * romaji is *shown* on cards; suppressing a match for something the
 * learner explicitly typed would be a bug, not a setting. Searching
 * "neko" has to find 猫 even with romaji display off — for a learner
 * without a Japanese IME it is the only way in.
 */
export function searchIndex(index, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return index.filter(
    (row) =>
      row.prompt.toLowerCase().includes(q) ||
      row.reading.toLowerCase().includes(q) ||
      row.romaji.toLowerCase().includes(q) ||
      row.answer.toLowerCase().includes(q)
  );
}