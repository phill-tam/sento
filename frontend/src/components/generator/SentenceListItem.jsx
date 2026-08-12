import { useState } from "react";
import styles from "../../styles/SentenceListItem.module.css";
import { useRomaji } from "../../context/RomajiContext";
import { playCardOpenSound, playCardCloseSound } from "../../utils/cardSoundEffects";

/**
 * One saved sentence row. Epic 5 chose "list display, not grid" for this
 * surface and that still holds — it is a list. What changed in epic 010
 * phase 4 is that the row flips, the same way a grammar row does.
 *
 * Front is the Japanese; back is the kana reading and the English. The
 * point is that a saved sentence is study content — it feeds the global
 * quiz pool alongside kanji, vocab and grammar — and this was the one
 * place that handed you the answer before you had tried to recall it.
 *
 * Romaji sits on BOTH faces: on the front it is the reading aid for the
 * Japanese, on the back it pairs with the kana. It stays conditional
 * rather than merely preference-gated, because `romaji` is null on
 * anything saved before epic 009 phase 2 and there is nothing to
 * backfill it from.
 *
 * The flip mechanic is FlashcardCard's, and deliberately not shared code
 * — see the note at the top of SentenceListItem.module.css and ADR 016.
 *
 * selectionMode (epic 6): when true, this row is selectable for a global
 * quiz run — mirrors FlashcardCard's selectionMode/isSelected/
 * onToggleSelect/selectDisabled contract exactly, bare sentence id in,
 * bare id out. The relocate/delete controls are swapped out for a
 * checkbox while selecting, rather than shown alongside it — avoids
 * accidental relocate/delete while picking quiz items, same reasoning
 * as FlashcardCard's mark button changing meaning instead of adding a
 * second control.
 *
 * Which controls appear on which face is its own decision. The ✓ is on
 * both, as FlashcardCard's mark button is, so a flipped row can still be
 * picked for a quiz. Relocate and delete are front-only: they are
 * browsing actions, the back face is the answer you flipped to check,
 * and putting a <select> on the dark face would need a second set of
 * on-chrome form styles to say nothing new.
 */
export default function SentenceListItem({
  sentence,
  folders,
  onRelocate,
  onDelete,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  selectDisabled = false,
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const { isVisible: showRomaji } = useRomaji();
  const hasRomaji = showRomaji && Boolean(sentence.romaji);

  function handleFlip() {
    setIsFlipped((prev) => {
      const next = !prev;
      // Same two effects the flashcards use, from the card sound system,
      // which keeps its own mute separate from the backsound's (epic 007).
      if (next) {
        playCardOpenSound();
      } else {
        playCardCloseSound();
      }
      return next;
    });
  }

  // Every control sits inside a face that is itself a click target, so
  // each one has to stop the row from flipping underneath it — the same
  // job handleMarkClick does on FlashcardCard. Keydown matters too: the
  // row answers Enter and Space, and Space is how you open a <select>.
  function stopRowGesture(e) {
    e.stopPropagation();
  }

  const checkButton = (onChrome) => (
    <button
      type="button"
      className={`${styles.checkBtn} ${onChrome ? styles.checkBtnOnChrome : ""} ${
        isSelected ? styles.checkBtnOn : ""
      }`}
      disabled={selectDisabled}
      aria-pressed={isSelected}
      aria-label={isSelected ? "Deselect for quiz" : "Select for quiz"}
      onClick={(e) => {
        stopRowGesture(e);
        onToggleSelect(sentence.id);
      }}
      onKeyDown={stopRowGesture}
    >
      ✓
    </button>
  );

  return (
    <li>
      <div
        className={`${styles.card} ${isFlipped ? styles.flipped : ""} ${
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
            <div className={styles.text}>
              <div className={styles.jp}>{sentence.jp_text}</div>
              {hasRomaji && <div className={styles.romaji}>{sentence.romaji}</div>}
            </div>

            {selectionMode ? (
              checkButton(false)
            ) : (
              <div
                className={styles.actions}
                onClick={stopRowGesture}
                onKeyDown={stopRowGesture}
              >
                <select
                  className={styles.folderSelect}
                  value={sentence.folder_id ?? ""}
                  onChange={(e) => onRelocate(sentence.id, e.target.value || null)}
                >
                  <option value="">Uncategorized</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  title="Delete sentence"
                  onClick={() => onDelete(sentence.id)}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div className={`${styles.face} ${styles.back}`}>
            <div className={styles.text}>
              <div className={styles.reading}>{sentence.reading}</div>
              {hasRomaji && <div className={styles.romajiOnChrome}>{sentence.romaji}</div>}
              <div className={styles.meaning}>{sentence.meaning_en}</div>
            </div>

            {selectionMode && checkButton(true)}
          </div>
        </div>
      </div>
    </li>
  );
}
