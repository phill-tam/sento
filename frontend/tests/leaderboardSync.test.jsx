/**
 * Guards for the leaderboard section on the Progress page (epic 015).
 *
 * Separated from progressPage.test.jsx even though both render the same
 * component — that file's setup (no fetch involved beyond the one
 * mocked-empty GET in its own beforeEach) is a different concern from
 * this one, which is entirely about the sync flow: request shaping,
 * success closing the dialog, failure keeping it open with the error
 * visible.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProgressPage from "../src/pages/ProgressPage";
import { recordRun } from "../src/stores/scoreStore";
import { mockFetchOnce } from "./fetchMock";

function seedRun() {
  return recordRun({ quizType: "choice", score: 8, total: 10, lines: ["kanji"] });
}

describe("Leaderboard section", () => {
  it("renders the fetched board", async () => {
    seedRun();
    mockFetchOnce({
      status: 200,
      body: { entries: [{ device_hash: "abcd", display_name: "Yuki", total_score: 42 }] },
    });

    render(<ProgressPage />);

    expect(await screen.findByText("Yuki")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("says so when nobody has synced yet", async () => {
    seedRun();
    mockFetchOnce({ status: 200, body: { entries: [] } });

    render(<ProgressPage />);

    expect(await screen.findByText("No one has synced to the leaderboard yet.")).toBeTruthy();
  });

  it("disables the sync button when there is no local history", async () => {
    mockFetchOnce({ status: 200, body: { entries: [] } });

    render(<ProgressPage />);
    await screen.findByText("No one has synced to the leaderboard yet.");

    expect(screen.getByRole("button", { name: "Sync to leaderboard" }).disabled).toBe(true);
  });

  it("submits a shaped request and closes the dialog on success", async () => {
    seedRun();
    mockFetchOnce({ status: 200, body: { entries: [] } }); // initial board load

    render(<ProgressPage />);
    await screen.findByText("No one has synced to the leaderboard yet.");

    fireEvent.click(screen.getByRole("button", { name: "Sync to leaderboard" }));
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Phil" } });

    mockFetchOnce({
      status: 200,
      body: { accepted_runs: 1, total_score: 8, device_hash: "c703" },
    }); // the submit itself
    mockFetchOnce({
      status: 200,
      body: { entries: [{ device_hash: "c703", display_name: "Phil", total_score: 8 }] },
    }); // the re-fetch after a successful sync

    // Two buttons share this name once the dialog is open — the page's
    // own trigger and the dialog's submit. The dialog's is the last,
    // same convention as the existing "Clear history" tests.
    const syncButtons = screen.getAllByRole("button", { name: "Sync to leaderboard" });
    fireEvent.click(syncButtons[syncButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    });

    const [, submitCall] = global.fetch.mock.calls;
    const [url, options] = submitCall;
    const body = JSON.parse(options.body);
    expect(url).toBe("http://localhost:8000/api/v1/leaderboard");
    expect(body.display_name).toBe("Phil");
    expect(body.runs).toEqual([
      expect.objectContaining({ quiz_type: "choice", score: 8, total: 10 }),
    ]);

    expect(await screen.findByText("Phil")).toBeTruthy();
  });

  it("keeps the dialog open and shows the error on a failed sync", async () => {
    seedRun();
    mockFetchOnce({ status: 200, body: { entries: [] } }); // initial board load

    render(<ProgressPage />);
    await screen.findByText("No one has synced to the leaderboard yet.");

    fireEvent.click(screen.getByRole("button", { name: "Sync to leaderboard" }));
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Phil" } });

    mockFetchOnce({ status: 502, statusText: "Bad Gateway", body: null });

    const syncButtons = screen.getAllByRole("button", { name: "Sync to leaderboard" });
    fireEvent.click(syncButtons[syncButtons.length - 1]);

    expect(await screen.findByPlaceholderText("Your name")).toBeTruthy();
    expect(screen.getByText(/failed/i)).toBeTruthy();
  });

  it("cannot submit a blank name", async () => {
    seedRun();
    mockFetchOnce({ status: 200, body: { entries: [] } });

    render(<ProgressPage />);
    await screen.findByText("No one has synced to the leaderboard yet.");

    fireEvent.click(screen.getByRole("button", { name: "Sync to leaderboard" }));

    const submitButtons = screen.getAllByRole("button", { name: "Sync to leaderboard" });
    const dialogSubmit = submitButtons[submitButtons.length - 1];
    expect(dialogSubmit.disabled).toBe(true);
  });
});
