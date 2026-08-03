import { useState } from "react";
import styles from "../../styles/FlashcardCard.module.css";

/**
 * One flip card for any content line, driven by a normalized item shape —
 * StudyPage (step 9) is responsible for mapping raw entries into this
 * shape per line:
 *   kanji:   example = { jp: compound_word, reading: compound_reading, en: compound_meaning_en }
 *   vocab:   example = null (vocab entries have no example sentence field)
 *   grammar: example = { jp: example_jp, reading: example_reading, en: example_en }
 *
 * item: { id, lineId, prompt, reading, answer, example: {jp, reading, en} | null }
 * isMastered / onToggleMastered: lifted from useMastered (step 5) by StudyPage.
 *
 * Back face is a fixed max-height with internal scroll — grammar's longest
 * seeded example (39 chars EN / 19 chars JP) fits without scrolling today,
 * but this keeps future longer content (N4+) from breaking the grid layout.
 */
export default function FlashcardCard({ item, isMastered, onToggleMastered }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      className={`${styles.card} ${isFlipped ? styles.flipped : ""}`}
      onClick={() => setIsFlipped((prev) => !prev)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsFlipped((prev) => !prev);
        }
      }}
    >
      <div className={styles.inner}>
        <div className={styles.face}>
          <button
            type="button"
            className={`${styles.masteredBtn} ${isMastered ? styles.mastered : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMastered(item.id);
            }}
            aria-label={isMastered ? "Mark as not mastered" : "Mark as mastered"}
            aria-pressed={isMastered}
          >
            ✓
          </button>
          <div className={styles.prompt}>{item.prompt}</div>
          {item.reading && <div className={styles.reading}>{item.reading}</div>}
        </div>

        <div className={`${styles.face} ${styles.back}`}>
          <div className={styles.backScroll}>
            <div className={styles.answer}>{item.answer}</div>
            {item.example ? (
              <div className={styles.example}>
                <div className={styles.exampleJp}>{item.example.jp}</div>
                {item.example.reading && (
                  <div className={styles.exampleReading}>{item.example.reading}</div>
                )}
                <div className={styles.exampleEn}>{item.example.en}</div>
              </div>
            ) : (
              <div className={styles.exampleFallback}>No example available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}