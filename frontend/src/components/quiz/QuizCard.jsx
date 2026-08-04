import styles from "../../styles/QuizCard.module.css";

/**
 * Single quiz question — 4 shuffled options (question.options), feedback
 * shown once phase is "answered". Purely controlled: useQuiz (owned by
 * StudyPage) drives phase/selectedOptionId, this component only renders
 * and reports clicks via onAnswer.
 *
 * question: { item: FlashcardItem, options: FlashcardItem[] } — from
 * useQuiz's currentQuestion. Correct answer is question.item.id.
 * phase: "answering" | "answered" — QuizCard doesn't render for idle/complete.
 */
export default function QuizCard({
  question,
  phase,
  selectedOptionId,
  onAnswer,
  questionNumber,
  totalQuestions,
}) {
  if (!question) return null;

  const { item, options } = question;
  const isAnswered = phase === "answered";

  return (
    <div className={styles.card}>
      <div className={styles.progress}>
        Question {questionNumber} / {totalQuestions}
      </div>

      <div className={styles.prompt}>
        <span className={styles.jp}>{item.prompt}</span>
        {item.reading && <span className={styles.reading}>{item.reading}</span>}
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
    </div>
  );
}