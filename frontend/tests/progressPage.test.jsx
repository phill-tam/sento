/**
 * Guards for the Progress view (epic 014).
 *
 * Behaviour only. Nothing here asserts on class names, layout or
 * decorative copy — those change for design reasons, would break for
 * non-reasons, and a suite that cries wolf gets ignored. What is worth
 * pinning is that the numbers on screen mean what the store says they
 * mean: accuracy averaged per answer rather than per run, and a
 * partly-graded run shown against the denominator it was actually
 * scored against.
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProgressPage from "../src/pages/ProgressPage";
import { readRuns, recordRun } from "../src/stores/scoreStore";

describe("ProgressPage", () => {
  it("shows an empty state rather than zeroes before any run is finished", () => {
    render(<ProgressPage />);

    expect(screen.getByText("No finished runs yet")).toBeTruthy();
    // 0% would be a claim about the learner's accuracy. There isn't one
    // to make yet.
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("averages accuracy per answer, not per run", () => {
    recordRun({ quizType: "choice", score: 10, total: 10, lines: ["kanji"] });
    recordRun({ quizType: "pairs", score: 0, total: 2, lines: ["vocab"] });

    render(<ProgressPage />);

    // 10 of 12 answers. A mean of the two runs' percentages would say 50%.
    expect(screen.getByText("83%")).toBeTruthy();
    expect(screen.getByText("10 of 12 answers")).toBeTruthy();
  });

  it("shows a partly-graded run against the denominator it was scored on", () => {
    recordRun({
      quizType: "pairs",
      score: 3,
      total: 4,
      skippedCount: 1,
      ungradedCount: 1,
      lines: ["vocab"],
    });

    render(<ProgressPage />);

    // Scoped to the run list: a single-run history also puts this score
    // in the "best run" tile, and the row is the assertion that matters.
    const row = within(screen.getByRole("list"));
    // Six pairs were written. Showing "3 / 6" here would report two
    // never-marked pairs as wrong answers.
    expect(row.getByText("3 / 4")).toBeTruthy();
    expect(row.getByText("1 skipped · 1 not checked")).toBeTruthy();
  });

  it("says so rather than showing a ratio when nothing was graded", () => {
    recordRun({ quizType: "pairs", score: 0, total: 0, ungradedCount: 6, lines: ["vocab"] });

    render(<ProgressPage />);

    expect(screen.getByText("Not graded")).toBeTruthy();
    expect(screen.queryByText("0 / 0")).toBeNull();
  });

  it("requires confirmation before clearing, and keeps the history on cancel", () => {
    recordRun({ quizType: "choice", score: 5, total: 10, lines: ["kanji"] });
    render(<ProgressPage />);

    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // The browser holds the only copy — a mis-click must not cost it.
    expect(readRuns()).toHaveLength(1);
  });

  it("clears the history once confirmed", () => {
    recordRun({ quizType: "choice", score: 5, total: 10, lines: ["kanji"] });
    render(<ProgressPage />);

    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    // Two buttons carry this label once the dialog is open — the page's
    // own trigger and the dialog's confirm. The dialog's is the last.
    const confirms = screen.getAllByRole("button", { name: "Clear history" });
    fireEvent.click(confirms[confirms.length - 1]);

    expect(readRuns()).toEqual([]);
    expect(screen.getByText("No finished runs yet")).toBeTruthy();
  });
});
