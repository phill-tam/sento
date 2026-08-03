import { CONTENT_LINES } from "./contentLines";

/**
 * Per-line category-id → icon overrides, reconciled against actual seed
 * data (kanji_seeds.py, vocab_seeds.py, grammar_seeds.py) — see epic 003
 * issue "known open items" (now resolved). Coverage:
 *   kanji: 9 categories · vocab: 13 categories · grammar: 17 categories
 * Falls back to the line's icon (contentLines.js) for any category not
 * listed here, so a future seed-data addition never breaks rendering.
 */
export const CATEGORY_ICONS = {
  kanji: {
    numbers: "数",
    time: "時",
    people_family: "人",
    places: "所",
    nature: "然",
    body_health: "体",
    adjectives: "形",
    verbs: "動",
    misc: "他",
  },
  vocab: {
    time: "時",
    family: "族",
    places: "所",
    nature: "然",
    body_health: "体",
    food: "食",
    greetings: "挨",
    objects: "物",
    question_words: "問",
    school_work: "学",
    adjectives: "形",
    adverbs: "副",
    verbs: "動",
  },
  grammar: {
    particles: "助",
    masu_form: "敬",
    plain_form: "常",
    te_form: "連",
    adjective_conjugation: "形",
    counters: "数",
    comparison: "比",
    conditionals: "件",
    desire_suggestion: "望",
    existence_location: "在",
    giving_receiving: "授",
    potential_ability: "能",
    question_indefinite: "疑",
    reason_purpose: "由",
    sentence_structure: "構",
    time_expressions: "時",
    other_patterns: "他",
  },
};

export function getCategoryIcon(lineId, categoryId) {
  return CATEGORY_ICONS[lineId]?.[categoryId] ?? CONTENT_LINES.find((line) => line.id === lineId)?.icon ?? "";
}