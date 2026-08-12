import styles from "../../styles/QuizCard.module.css";
import { useRomaji } from "../../context/RomajiContext";

/**
 * Single quiz question — 4 shuffled options (question.options), feedback
 * shown once phase is "answered". Purely controlled: useQuiz (owned by
 * StudyPage) drives phase/selectedOptionId, this component only renders
 * and reports clicks via onAnswer/onNext.
 *
 * score/questionNumber/totalQuestions: score reflects fully-graded
 * questions only — the current question counts toward the displayed
 * denominator once it's answered, not before (matches the running-tally
 * UX in the mockup, e.g. "Score: 0/2" while sitting on question 3).
 *
 * onQuit: optional. An active quiz used to have no labelled way out —
 * you either answered every question or navigated away and met the
 * discard dialog by accident. This renders the same exit on purpose. It
 * sits in the header rather than the footer to keep it away from
 * "Next question", and it is optional so the component still renders
 * without an exit if a caller has no teardown to offer.
 */
export default function QuizCard({
  question,
  phase,
  selectedOptionId,
  onAnswer,
  onNext,
  questionNumber,
  totalQuestions,
  score,
  onQuit,
}) {
  const { isVisible: showRomaji } = useRomaji();

  if (!question) return null;

  const { item, options } = question;
  const isAnswered = phase === "answered";
  const isLastQuestion = questionNumber === totalQuestions;
  const answeredCount = isAnswered ? questionNumber : questionNumber - 1;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.headerText}>
          Stop {questionNumber} of {totalQuestions} — what does this mean?
        </span>
        {onQuit && (
          <button
            type="button"
            className={styles.quitBtn}
            onClick={onQuit}
            title="End this quiz and discard your progress"
          >
            Quit
          </button>
        )}
      </div>

      <div className={styles.prompt}>
        <span className={styles.jp}>{item.prompt}</span>
        {item.reading && <span className={styles.reading}>{item.reading}</span>}
        {showRomaji && item.romaji && (
          <span className={styles.romaji}>{item.romaji}</span>
        )}
      </div>

      <div className={styles.options}>
        {options.map((option) => {
          const isCorrect = option.id === item.id;
          const isChosen = option.id === selectedOptionId;

          let optionState = "";
          if (isAnswered) {
            if (isCorrect) optionState = styles.correct;
            else if (isChosen) optionState = styles.incorrect;
          }

          return (
            <button
              key={option.id}
              type="button"
              className={`${styles.option} ${optionState}`}
              onClick={() => !isAnswered && onAnswer(option.id)}
              disabled={isAnswered}
            >
              {option.answer}
            </button>
          );
        })}
      </div>

      <div className={styles.footer}>
        <div className={styles.score}>
          Score: {score} / {answeredCount}
        </div>
        {isAnswered && (
          <button type="button" className={styles.nextBtn} onClick={onNext}>
            {isLastQuestion ? "See results" : "Next question"}
          </button>
        )}
      </div>
    </div>
  );
}