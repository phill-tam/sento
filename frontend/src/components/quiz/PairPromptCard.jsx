import { useRomaji } from "../../context/RomajiContext";
import styles from "../../styles/PairPromptCard.module.css";

/**
 * One pair-writing task: two words, and a box to write one sentence
 * using both (epic 012).
 *
 * Fully controlled. The hook owns the answer text and which pair is on
 * screen; this renders what it is given and reports edits.
 *
 * The English gloss is shown, not hidden. This is not a recall test —
 * the learner is being asked to demonstrate they know which *sense* a
 * word carries, and withholding the meaning would turn it into a
 * different exercise that happens to use the same screen.
 *
 * Romaji follows the global preference exactly as the flashcards do, via
 * RomajiContext rather than a prop, so the setting reaches it without
 * every intermediate component having to pass it down.
 */
export default function PairPromptCard({
  pair,
  value = "",
  onChange,
  onNext,
  onBack,
  onSubmit,
  onQuit,
  pairNumber = 1,
  totalPairs = 1,
  isLastPair = false,
  maxLength = 300,
  isGrading = false,
}) {
  const { isVisible: showRomaji } = useRomaji();

  if (!pair) return null;

  const remaining = maxLength - value.length;
  const isBlank = value.trim().length === 0;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.headerText}>
          Pair {pairNumber} of {totalPairs}
        </span>
        <button type="button" className={styles.quitBtn} onClick={onQuit}>
          Quit
        </button>
      </div>

      <div className={styles.words}>
        {pair.words.map((item) => (
          <div key={`${item.lineId}:${item.id}`} className={styles.word}>
            <span className={styles.jp}>{item.prompt}</span>
            {item.reading ? <span className={styles.reading}>{item.reading}</span> : null}
            {showRomaji && item.romaji ? (
              <span className={styles.romaji}>{item.romaji}</span>
            ) : null}
            <span className={styles.gloss}>{item.answer}</span>
          </div>
        ))}
      </div>

      <label className={styles.prompt} htmlFor="pair-answer">
        Write one English sentence using both words.
      </label>

      <textarea
        id="pair-answer"
        className={styles.input}
        value={value}
        maxLength={maxLength}
        rows={3}
        disabled={isGrading}
        placeholder="Your sentence…"
        onChange={(event) => onChange?.(event.target.value)}
      />

      <div className={styles.meta}>
        {/* Counts down rather than up, and only once it is worth knowing.
            A permanent "0 / 300" invites treating the ceiling as a target
            when one sentence is what is being asked for. */}
        {remaining <= 60 ? (
          <span className={remaining === 0 ? styles.countFull : styles.count}>
            {remaining} characters left
          </span>
        ) : (
          <span />
        )}
        {isBlank ? <span className={styles.skipNote}>Leave blank to skip this pair.</span> : null}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={onBack}
          disabled={pairNumber === 1 || isGrading}
        >
          Back
        </button>
        {isLastPair ? (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onSubmit}
            disabled={isGrading}
          >
            {isGrading ? "Grading…" : "Submit run"}
          </button>
        ) : (
          <button type="button" className={styles.primaryBtn} onClick={onNext} disabled={isGrading}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}
