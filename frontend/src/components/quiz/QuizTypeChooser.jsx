import styles from "../../styles/QuizTypeChooser.module.css";

/**
 * Picks which kind of quiz a run will be (epic 012).
 *
 * Fully controlled, no internal state — same contract as ToggleSwitch and
 * CategoryTree. It knows nothing about selection, caps or how a run
 * starts; it reports a choice and renders the one it is given.
 *
 * Word pairs carries the animated glow border ModeToggle already uses for
 * the Sentence Generator, because it means the same thing here: this
 * option calls an AI provider. Reusing that signal is the point — a
 * second, different "AI" treatment would teach the learner that the glow
 * doesn't reliably mean anything.
 *
 * `pairsDisabled` is a real state rather than a hidden option. Word pairs
 * needs two or more kanji/vocab items, so a selection of grammar cards or
 * saved sentences cannot start one — but hiding the option in that case
 * leaves the learner with no idea why it appeared before and doesn't now.
 * The reason renders beside it.
 */
export default function QuizTypeChooser({
  value = "choice",
  onChange,
  pairsDisabled = false,
  pairsDisabledReason,
}) {
  const options = [
    {
      id: "choice",
      label: "Multiple choice",
      hint: "Pick the right meaning. Graded instantly.",
      disabled: false,
    },
    {
      id: "pairs",
      label: "Word pairs",
      hint: "Write a sentence using two words. Graded by AI.",
      disabled: pairsDisabled,
    },
  ];

  return (
    <div className={styles.chooser} role="radiogroup" aria-label="Quiz type">
      {options.map((option) => {
        const isActive = value === option.id && !option.disabled;
        const isAi = option.id === "pairs";

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={option.disabled}
            // The reason is announced with the control rather than only
            // shown next to it, so it reaches a screen reader that never
            // reads the sibling text.
            aria-describedby={
              option.disabled && pairsDisabledReason ? `${option.id}-reason` : undefined
            }
            className={[
              styles.option,
              isActive ? styles.active : "",
              isAi && !option.disabled ? styles.ai : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange?.(option.id)}
          >
            <span className={styles.label}>{option.label}</span>
            <span className={styles.hint}>{option.hint}</span>
          </button>
        );
      })}

      {pairsDisabled && pairsDisabledReason ? (
        <p id="pairs-reason" className={styles.reason}>
          {pairsDisabledReason}
        </p>
      ) : null}
    </div>
  );
}
