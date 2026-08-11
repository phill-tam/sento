import { useState } from "react";
import styles from "../../styles/FlashcardCard.module.css";
import { useRomaji } from "../../context/RomajiContext";
import { playCardOpenSound, playCardCloseSound } from "../../utils/cardSoundEffects";

/**
 * Flip card matching sento-ui-mockup.html's .card/.card-face design exactly
 * (colors, sizes, tag/mark-btn placement — see mockup lines 153-183).
 *
 * item: { id, lineId, prompt, reading, romaji, answer,
 *          example: {jp, reading, romaji, en} | null,
 *          onyomi?, kunyomi?, onyomiRomaji?, kunyomiRomaji? }
 * onyomi/kunyomi are kanji-only, kept separate from the combined `reading`
 * string so the front face can label them (mockup's yomiHtml: 音/訓 prefixes).
 * Their romaji is carried per-reading for the same reason — the labelled
 * 音/訓 layout has to pair each romaji with its own reading, which a single
 * joined string can't do (epic 009).
 * categoryLabel: active category's display label — mockup's .card-tag shows
 * this (theme.en) on every card in the grid.
 *
 * selectionMode (epic 004): when true, the ✓ button means "select for quiz"
 * instead of "toggle mastered" — isSelected/onToggleSelect drive it instead
 * of isMastered/onToggleMastered. The mastered badge keeps rendering off
 * isMastered regardless of mode; the two are structurally independent.
 * selectDisabled: true when the quiz selection cap (20) is reached and this
 * card isn't already selected — never disables an already-selected card,
 * so deselecting to free a slot always stays possible.
 *
 * layout (epic 010): "grid" is the 200px flip tile this component has
 * always been; "list" is a full-width row that flips vertically instead,
 * for content too long for a tile (grammar patterns, long vocab). It
 * swaps one class and nothing else — every branch below, both handlers,
 * the ✓ button's two meanings and the 音/訓 split are shared verbatim, so
 * the two layouts cannot drift. Same reasoning as ToggleSwitch's
 * `orientation`. Which categories get which layout is not decided here —
 * see utils/categoryLayout.js.
 */
export default function FlashcardCard({
  item,
  categoryLabel,
  isMastered,
  onToggleMastered,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  selectDisabled = false,
  layout = "grid",
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const isKanji = item.lineId === "kanji";
  // Display only — romaji still feeds search regardless of this. See
  // RomajiContext.
  const { isVisible: showRomaji } = useRomaji();

  function handleFlip() {
    setIsFlipped((prev) => {
      const next = !prev;
      // Level and mute come from CardSoundContext, which stays separate
      // from the backsound's own mute so silencing the music does not
      // silence flips — see epic 007.
      if (next) {
        playCardOpenSound();
      } else {
        playCardCloseSound();
      }
      return next;
    });
  }

  function handleMarkClick(e) {
    e.stopPropagation();
    if (selectionMode) {
      if (selectDisabled) return;
      onToggleSelect(item.id);
    } else {
      onToggleMastered(item.id);
    }
  }

  const markOn = selectionMode ? isSelected : isMastered;
  const markLabel = selectionMode
    ? isSelected
      ? "Deselect for quiz"
      : "Select for quiz"
    : isMastered
    ? "Mark as not mastered"
    : "Mark as mastered";

  return (
    <div
      className={`${styles.card} ${layout === "list" ? styles.list : ""} ${
        isFlipped ? styles.flipped : ""
      } ${selectionMode ? styles.selectable : ""} ${
        selectionMode && isSelected ? styles.selected : ""
      }`}
      onClick={handleFlip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleFlip();
        }
      }}
    >
      <div className={styles.inner}>
        <div className={`${styles.face} ${styles.front}`}>
          <span className={styles.tag}>{categoryLabel}</span>
          {isMastered && <span className={styles.masteredBadge}>Mastered</span>}

          {isKanji ? (
            <>
              <div className={styles.kanjiBig}>{item.prompt}</div>
              <div className={styles.yomi}>
                {item.onyomi && (
                  <>
                    <b>音</b>
                    {item.onyomi}
                  </>
                )}
                {item.onyomi && item.kunyomi && "\u3000"}
                {item.kunyomi && (
                  <>
                    <b>訓</b>
                    {item.kunyomi}
                  </>
                )}
              </div>
              {showRomaji && (item.onyomiRomaji || item.kunyomiRomaji) && (
                <div className={styles.romaji}>
                  {item.onyomiRomaji}
                  {item.onyomiRomaji && item.kunyomiRomaji && "　"}
                  {item.kunyomiRomaji}
                </div>
              )}
            </>
          ) : (
            <>
              <div className={styles.jp}>{item.prompt}</div>
              {item.reading && <div className={styles.reading}>{item.reading}</div>}
              {showRomaji && item.romaji && (
                <div className={styles.romaji}>{item.romaji}</div>
              )}
            </>
          )}

          <button
            type="button"
            className={`${styles.markBtn} ${markOn ? styles.on : ""} ${
              selectionMode && selectDisabled ? styles.disabled : ""
            }`}
            onClick={handleMarkClick}
            aria-label={markLabel}
            aria-pressed={markOn}
            disabled={selectionMode && selectDisabled}
          >
            ✓
          </button>
        </div>

        <div className={`${styles.face} ${styles.back}`}>
          <div className={styles.meaning}>{item.answer}</div>

          {item.example ? (
            <div className={styles.example}>
              <div className={styles.exampleWord}>{item.example.jp}</div>
              {item.example.reading && (
                <div className={styles.exampleReading}>{item.example.reading}</div>
              )}
              {showRomaji && item.example.romaji && (
                <div className={styles.exampleRomaji}>{item.example.romaji}</div>
              )}
              <div className={styles.exampleMeaning}>{item.example.en}</div>
            </div>
          ) : (
            item.reading && (
              <>
                <div className={styles.meaningReading}>{item.reading}</div>
                {showRomaji && item.romaji && (
                  <div className={styles.meaningRomaji}>{item.romaji}</div>
                )}
              </>
            )
          )}

          <button
            type="button"
            className={`${styles.markBtn} ${styles.markBtnBack} ${markOn ? styles.on : ""} ${
              selectionMode && selectDisabled ? styles.disabled : ""
            }`}
            onClick={handleMarkClick}
            aria-label={markLabel}
            aria-pressed={markOn}
            disabled={selectionMode && selectDisabled}
          >
            ✓
          </button>
        </div>
      </div>
    </div>
  );
}
