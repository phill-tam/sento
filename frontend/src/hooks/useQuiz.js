import { useState, useMemo, useCallback } from "react";

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildOptions(correctItem, categoryPool) {
  const seenAnswers = new Set([correctItem.answer]);
  const distractorPool = [];
  for (const entry of categoryPool) {
    if (entry.id === correctItem.id) continue;
    if (seenAnswers.has(entry.answer)) continue;
    seenAnswers.add(entry.answer);
    distractorPool.push(entry);
  }
  // fallback: if dedup left fewer than 3 (heavy answer overlap in this
  // category), pad from the remaining pool even if answers repeat, so a
  // question is never rendered with fewer than 4 options
  if (distractorPool.length < 3) {
    for (const entry of categoryPool) {
      if (entry.id === correctItem.id) continue;
      if (distractorPool.includes(entry)) continue;
      distractorPool.push(entry);
      if (distractorPool.length >= 3) break;
    }
  }

  const distractors = shuffle(distractorPool).slice(0, 3);
  return shuffle([correctItem, ...distractors]);
}

/**
 * Quiz state machine over a manually-selected subset of FlashcardItems.
 * categoryPool: the full open category's items (>= 4, guaranteed by
 * StudyPage's guard) — source for each question's wrong-answer options.
 * Questions are generated once, up front, in shuffled order — not
 * regenerated per render, so option order stays stable while answering.
 */
export function useQuiz(selectedItems, categoryPool) {
  const questions = useMemo(
    () =>
      shuffle(selectedItems).map((item) => ({
        item,
        options: buildOptions(item, categoryPool),
      })),
    // frozen at mount — App.jsx guards navigation during an active quiz,
    // so selectedItems/categoryPool never change mid-quiz
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [phase, setPhase] = useState("idle");
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState(null);

  const currentQuestion = questions[index] ?? null;

  const start = useCallback(() => {
    setPhase("answering");
  }, []);

  const answer = useCallback(
    (optionId) => {
      if (phase !== "answering" || !currentQuestion) return;
      setSelectedOptionId(optionId);
      if (optionId === currentQuestion.item.id) {
        setScore((prev) => prev + 1);
      }
      setPhase("answered");
    },
    [phase, currentQuestion]
  );

  const next = useCallback(() => {
    if (phase !== "answered") return;
    setSelectedOptionId(null);
    if (index + 1 >= questions.length) {
      setPhase("complete");
    } else {
      setIndex((prev) => prev + 1);
      setPhase("answering");
    }
  }, [phase, index, questions.length]);

  const restart = useCallback(() => {
    setIndex(0);
    setScore(0);
    setSelectedOptionId(null);
    setPhase("idle");
  }, []);

  return {
    phase,
    currentQuestion,
    questionNumber: index + 1,
    totalQuestions: questions.length,
    score,
    selectedOptionId,
    start,
    answer,
    next,
    restart,
  };
}