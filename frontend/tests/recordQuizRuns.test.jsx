/**
 * Guards for recording a completed run (epic 014).
 *
 * These exist because the bugs they catch are silent. A run recorded
 * twice, a run lost because the learner closed the tab on the summary,
 * and a pairs run whose denominator came from the wrong field all
 * produce a Progress page that looks entirely plausible and is wrong.
 * None of them throws, and none is visible while clicking through the
 * app.
 *
 * Everything renders inside <StrictMode>, because main.jsx does and
 * Testing Library does not. What that buys is worth stating precisely,
 * since it was measured rather than assumed:
 *
 * - StrictMode double-invokes effects on mount. For QuizRunner that is
 *   harmless — the run is not complete at mount, so the effect returns
 *   early — which means a StrictMode wrapper alone does NOT exercise the
 *   `recorded` latch there. The rerender case is what does.
 * - The pairs cases mock the hook into "complete" at mount, so their
 *   effect does fire on both invocations, and they exercise the latch
 *   through that path as well as through their own rerender case.
 *
 * The real defect the latch guards in production is the same in both:
 * the effect re-runs on any dependency identity change, so a parent
 * re-render while the summary is on screen records the run again.
 */
import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RomajiProvider } from "../src/context/RomajiContext";
import QuizRunner from "../src/components/quiz/QuizRunner";
import PairWritingRunner from "../src/components/quiz/PairWritingRunner";
import { readRuns } from "../src/stores/scoreStore";

// The pairs hook talks to the grading endpoint, and the scenario worth
// testing — a provider that returned fewer verdicts than there were
// pairs — is defined entirely by what the hook reports. Mocking it puts
// the runner's own contract under test rather than the network.
vi.mock("../src/hooks/usePairWriting", () => ({ usePairWriting: vi.fn() }));
import { usePairWriting } from "../src/hooks/usePairWriting";

const ITEMS = [
  { id: "k1", lineId: "kanji", prompt: "日", reading: "ひ", answer: "sun" },
  { id: "v1", lineId: "vocab", prompt: "本", reading: "ほん", answer: "book" },
];

const POOL = [
  ...ITEMS,
  { id: "k2", lineId: "kanji", prompt: "月", reading: "つき", answer: "moon" },
  { id: "v2", lineId: "vocab", prompt: "水", reading: "みず", answer: "water" },
  { id: "v3", lineId: "vocab", prompt: "山", reading: "やま", answer: "mountain" },
];

function renderQuiz(props = {}) {
  return render(
    <StrictMode>
      <RomajiProvider>
        <QuizRunner
          selectedItems={ITEMS}
          globalPool={POOL}
          onFinish={props.onFinish ?? (() => {})}
          onQuit={props.onQuit ?? (() => {})}
        />
      </RomajiProvider>
    </StrictMode>
  );
}

/**
 * Answers whichever question is on screen correctly.
 *
 * Questions are shuffled at mount, so the test cannot assume an order —
 * it reads the prompt that is actually rendered and clicks that item's
 * meaning. Clicking a fixed position would make the expected score
 * depend on the shuffle.
 */
function answerCorrectly() {
  const item = ITEMS.find((candidate) => screen.queryByText(candidate.prompt));
  fireEvent.click(screen.getByRole("button", { name: item.answer }));
}

function completeQuizCorrectly() {
  answerCorrectly();
  fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  answerCorrectly();
  fireEvent.click(screen.getByRole("button", { name: "See results" }));
}

describe("QuizRunner", () => {
  it("records exactly one run for one completed quiz", () => {
    renderQuiz();
    completeQuizCorrectly();

    const runs = readRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ quizType: "choice", score: 2, total: 2 });
  });

  it("records nothing until the run is actually complete", () => {
    renderQuiz();
    expect(readRuns()).toEqual([]);

    answerCorrectly();
    expect(readRuns()).toEqual([]);
  });

  it("records once when the parent re-renders after the summary appears", () => {
    const { rerender } = renderQuiz();
    completeQuizCorrectly();

    // A fresh selectedItems array with the same contents — what any
    // parent re-render produces when the memo behind it is invalidated.
    // The effect re-runs on the new identity; the run must not be
    // recorded a second time.
    rerender(
      <StrictMode>
        <RomajiProvider>
          <QuizRunner
            selectedItems={[...ITEMS]}
            globalPool={POOL}
            onFinish={() => {}}
            onQuit={() => {}}
          />
        </RomajiProvider>
      </StrictMode>
    );

    expect(readRuns()).toHaveLength(1);
  });

  it("records on reaching the summary, without Finish being clicked", () => {
    const onFinish = vi.fn();
    renderQuiz({ onFinish });
    completeQuizCorrectly();

    // The learner is looking at the summary and has touched nothing else.
    // Closing the tab here must not cost them the run.
    expect(screen.getByText("Quiz complete")).toBeTruthy();
    expect(onFinish).not.toHaveBeenCalled();
    expect(readRuns()).toHaveLength(1);
  });

  it("stores which content lines the run drew on", () => {
    renderQuiz();
    completeQuizCorrectly();

    expect(readRuns()[0].lines.sort()).toEqual(["kanji", "vocab"]);
  });

  it("records nothing when the learner quits mid-run", () => {
    const onQuit = vi.fn();
    renderQuiz({ onQuit });

    answerCorrectly();
    fireEvent.click(screen.getByRole("button", { name: "Quit" }));

    expect(onQuit).toHaveBeenCalled();
    expect(readRuns()).toEqual([]);
  });

  it("records a wrong answer as a lower score, not as a missing run", () => {
    renderQuiz();

    // Answer the first question wrongly by picking a distractor: any
    // option that is not the displayed item's own meaning.
    const item = ITEMS.find((candidate) => screen.queryByText(candidate.prompt));
    const wrong = POOL.find((p) => p.answer !== item.answer && screen.queryByRole("button", { name: p.answer }));
    fireEvent.click(screen.getByRole("button", { name: wrong.answer }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    answerCorrectly();
    fireEvent.click(screen.getByRole("button", { name: "See results" }));

    expect(readRuns()[0]).toMatchObject({ score: 1, total: 2 });
  });
});

describe("PairWritingRunner", () => {
  const PAIRS = Array.from({ length: 6 }, (_, i) => ({
    pairId: `p${i}`,
    words: [ITEMS[0], ITEMS[1]],
  }));

  function renderPairs(results) {
    usePairWriting.mockReturnValue({
      phase: "complete",
      pairs: PAIRS,
      currentPair: null,
      pairNumber: 6,
      totalPairs: 6,
      isLastPair: true,
      answers: {},
      // Only four pairs came back — the two the provider dropped have no
      // verdict at all, which is exactly the run this test is about.
      verdicts: {},
      results,
      error: null,
      rateLimitError: null,
      setAnswer: vi.fn(),
      goNext: vi.fn(),
      goBack: vi.fn(),
      submitRun: vi.fn(),
    });

    return render(
      <StrictMode>
        <RomajiProvider>
          <PairWritingRunner selectedItems={ITEMS} onFinish={() => {}} onQuit={() => {}} />
        </RomajiProvider>
      </StrictMode>
    );
  }

  it("stores the graded count as the denominator, not the number of pairs", () => {
    renderPairs({ score: 3, gradedCount: 4, skippedCount: 1, ungradedCount: 1 });

    const [run] = readRuns();
    // 6 pairs were written; 4 were judged. Storing 6 here would render as
    // "3 of 6, you got three wrong" on the Progress page, for two pairs
    // that were never marked at all.
    expect(run.total).toBe(4);
    expect(run).toMatchObject({
      quizType: "pairs",
      score: 3,
      skippedCount: 1,
      ungradedCount: 1,
    });
  });

  it("records exactly one run for one completed run", () => {
    renderPairs({ score: 2, gradedCount: 2, skippedCount: 0, ungradedCount: 0 });

    expect(readRuns()).toHaveLength(1);
  });

  it("records once when the parent re-renders after completion", () => {
    const { rerender } = renderPairs({
      score: 2,
      gradedCount: 2,
      skippedCount: 0,
      ungradedCount: 0,
    });

    rerender(
      <StrictMode>
        <RomajiProvider>
          <PairWritingRunner
            selectedItems={[...ITEMS]}
            onFinish={() => {}}
            onQuit={() => {}}
          />
        </RomajiProvider>
      </StrictMode>
    );

    expect(readRuns()).toHaveLength(1);
  });

  it("records a run the grader never scored, with a zero denominator", () => {
    renderPairs({ score: 0, gradedCount: 0, skippedCount: 0, ungradedCount: 6 });

    // Kept, because it happened and cost the learner time. readStats is
    // what keeps a 0/0 out of the accuracy average, not the recording.
    const [run] = readRuns();
    expect(run).toMatchObject({ score: 0, total: 0, ungradedCount: 6 });
  });
});

beforeEach(() => {
  usePairWriting.mockReset();
});
