import { useState, useMemo, useCallback } from "react";

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Builds the ordered candidate pool to draw distractors from, for one
 * correct item (epic 6 — global, mixed-type quiz).
 *
 * - Sentence items (lineId "sentence"): distractors are meanings pulled
 *   from the sentence's OWN source_item_refs, resolved against
 *   globalPool — per the epic's decision, a sentence's wrong answers
 *   come from what it was actually generated from, not arbitrary other
 *   sentences. Falls back to other sentences' meanings if that list is
 *   short.
 * - Everything else (kanji/vocab/grammar): distractors come from the
 *   same lineId, anywhere in globalPool — no longer scoped to one
 *   category, since selection itself is now global/cross-category.
 *   Falls back to the full pool if the same-line set is short.
 */
function poolFor(correctItem, globalPool) {
  if (correctItem.lineId === "sentence") {
    const refs = correctItem.source_item_refs ?? [];
    const resolvedSourceItems = refs
      .map((ref) => globalPool.find((p) => p.lineId === ref.line_id && p.id === ref.item_id))
      .filter(Boolean);
    const otherSentences = globalPool.filter((p) => p.lineId === "sentence");
    return [...resolvedSourceItems, ...otherSentences];
  }

  const sameLine = globalPool.filter((p) => p.lineId === correctItem.lineId);
  return [...sameLine, ...globalPool];
}

function buildOptions(correctItem, globalPool) {
  const pool = poolFor(correctItem, globalPool);

  const seenAnswers = new Set([correctItem.answer]);
  const distractorPool = [];
  for (const entry of pool) {
    if (entry.id === correctItem.id) continue;
    if (seenAnswers.has(entry.answer)) continue;
    seenAnswers.add(entry.answer);
    distractorPool.push(entry);
  }
  // fallback: if dedup left fewer than 3 (heavy answer overlap, or a
  // short source/sentence pool), pad from the remaining pool even if
  // answers repeat, so a question is never rendered with fewer options
  // than the pool can actually supply
  if (distractorPool.length < 3) {
    for (const entry of pool) {
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
 * Quiz state machine over a manually-selected subset of quiz items.
 *
 * globalPool (epic 6 — renamed from categoryPool): the full set of
 * eligible items to draw distractors from, spanning every content line
 * AND saved sentences together — no longer scoped to one category or
 * one line. Caller is responsible for actually assembling this (see
 * App.jsx's promoted QuizRunner, Step 4) — this hook has no opinion on
 * where the items come from, only how to build fair multiple-choice
 * options from whatever it's given.
 *
 * Questions are generated once, up front, in shuffled order — not
 * regenerated per render, so option order stays stable while answering.
 */
export function useQuiz(selectedItems, globalPool) {
  const questions = useMemo(
    () =>
      shuffle(selectedItems).map((item) => ({
        item,
        options: buildOptions(item, globalPool),
      })),
    // frozen at mount — App.jsx guards navigation during an active quiz,
    // so selectedItems/globalPool never change mid-quiz
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