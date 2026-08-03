/**
 * Shared per-content-line metadata — single source for studyTreeAdapter.js's
 * top-level tree nodes and StudyPage's header (epic 003, Section 2).
 *
 * icon values match epic 002's contentTreeAdapter.js LINE_ICONS for visual
 * consistency between the CMS and Study views.
 */
export const CONTENT_LINES = [
  {
    id: "kanji",
    label: "Kanji",
    labelJp: "漢字",
    icon: "漢",
    unitLabel: "characters",
  },
  {
    id: "vocab",
    label: "Vocabulary",
    labelJp: "語彙",
    icon: "語",
    unitLabel: "words",
  },
  {
    id: "grammar",
    label: "Grammar",
    labelJp: "文法",
    icon: "文",
    unitLabel: "patterns",
  },
];