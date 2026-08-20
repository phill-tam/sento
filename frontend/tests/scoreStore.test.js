/**
 * Guards for the score store (epic 014).
 *
 * These are not incidental coverage. The store is the only copy of a
 * learner's history, and two of its rules are the kind that look like
 * over-caution until the day they matter:
 *
 * - it rewrites the whole key on every write, so a reader that returns []
 *   on unreadable data is the first half of a delete;
 * - the denominator it stores is the one that was shown on screen, which
 *   for word pairs is the graded count and not the run length.
 *
 * Both are invisible in ordinary use and neither would be caught by
 * clicking through the app.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearRuns,
  readRuns,
  readStats,
  recordRun,
} from "../src/stores/scoreStore";

const KEY = "sento:scores";

function choiceRun(overrides = {}) {
  return { quizType: "choice", score: 8, total: 10, lines: ["kanji"], ...overrides };
}

function pairsRun(overrides = {}) {
  return { quizType: "pairs", score: 3, total: 4, lines: ["vocab"], ...overrides };
}

function quarantineKeys() {
  return Object.keys(localStorage).filter((k) => k.startsWith(`${KEY}:quarantine:`));
}

describe("recordRun / readRuns", () => {
  it("round-trips a run through storage", () => {
    const stored = recordRun(choiceRun());

    expect(stored).toMatchObject({ quizType: "choice", score: 8, total: 10 });
    expect(stored.id).toEqual(expect.any(String));
    expect(stored.completedAt).toEqual(expect.any(String));
    expect(readRuns()).toEqual([stored]);
  });

  it("defaults the pair-only counts so a choice run has a complete shape", () => {
    const stored = recordRun(choiceRun());

    expect(stored.skippedCount).toBe(0);
    expect(stored.ungradedCount).toBe(0);
  });

  it("returns runs newest first", () => {
    recordRun(choiceRun({ score: 1 }));
    recordRun(choiceRun({ score: 2 }));
    recordRun(choiceRun({ score: 3 }));

    expect(readRuns().map((run) => run.score)).toEqual([3, 2, 1]);
  });

  it("reads an empty history before anything is recorded", () => {
    expect(readRuns()).toEqual([]);
  });

  it("prunes the oldest runs at the retention cap", () => {
    for (let i = 0; i < 205; i += 1) {
      recordRun(choiceRun({ score: i }));
    }

    const runs = readRuns();
    expect(runs).toHaveLength(200);
    // Newest kept, oldest five dropped.
    expect(runs[0].score).toBe(204);
    expect(runs.at(-1).score).toBe(5);
  });

  it("keeps the denominator it was given rather than the run length", () => {
    // The word-pairs case: six pairs written, two never graded. Storing 6
    // here would make the Progress view report "3 of 6, you got three
    // wrong" for a run the learner was shown as "3 of 4".
    const stored = recordRun(pairsRun({ score: 3, total: 4, ungradedCount: 2 }));

    expect(stored.total).toBe(4);
    expect(stored.ungradedCount).toBe(2);
  });
});

describe("unreadable data", () => {
  it("quarantines an unparseable value instead of dropping it", () => {
    localStorage.setItem(KEY, "{ not json");

    expect(readRuns()).toEqual([]);

    const moved = quarantineKeys();
    expect(moved).toHaveLength(1);
    expect(localStorage.getItem(moved[0])).toBe("{ not json");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("quarantines an envelope from an unknown version", () => {
    const future = JSON.stringify({ v: 99, items: [{ score: 1 }] });
    localStorage.setItem(KEY, future);

    expect(readRuns()).toEqual([]);
    expect(localStorage.getItem(quarantineKeys()[0])).toBe(future);
  });

  it("quarantines an envelope whose items are not an array", () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, items: { nope: true } }));

    expect(readRuns()).toEqual([]);
    expect(quarantineKeys()).toHaveLength(1);
  });

  it("does not lose the quarantined copy when a new run is recorded after", () => {
    // The failure this whole mechanism exists to prevent: read returns
    // empty, the next completed quiz writes over the key, and the
    // library is gone. The moved copy must survive that write.
    localStorage.setItem(KEY, "corrupt");
    readRuns();
    recordRun(choiceRun());

    expect(quarantineKeys()).toHaveLength(1);
    expect(readRuns()).toHaveLength(1);
  });
});

describe("write failure", () => {
  it("returns null instead of throwing when storage rejects the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    // The contract a just-finished quiz depends on: no dialog, no crash,
    // the run is simply not kept.
    expect(() => recordRun(choiceRun())).not.toThrow();
    expect(recordRun(choiceRun())).toBeNull();

    vi.restoreAllMocks();
    expect(readRuns()).toEqual([]);
  });
});

describe("clearRuns", () => {
  it("empties the history", () => {
    recordRun(choiceRun());
    clearRuns();

    expect(readRuns()).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("readStats", () => {
  it("reports nulls rather than zeroes with no history", () => {
    const stats = readStats();

    expect(stats.overall.runs).toBe(0);
    expect(stats.overall.accuracy).toBeNull();
    expect(stats.best).toBeNull();
  });

  it("averages across runs by answer, not by run", () => {
    recordRun(choiceRun({ score: 10, total: 10 }));
    recordRun(pairsRun({ score: 0, total: 2 }));

    // 10 of 12 answers, not the 50% a mean-of-means would give.
    expect(readStats().overall.accuracy).toBeCloseTo(10 / 12);
  });

  it("counts an ungraded run but keeps it out of the average", () => {
    recordRun(choiceRun({ score: 5, total: 10 }));
    recordRun(pairsRun({ score: 0, total: 0, ungradedCount: 6 }));

    const { overall } = readStats();
    expect(overall.runs).toBe(2);
    expect(overall.gradedRuns).toBe(1);
    // Not 5/10 dragged toward zero by a 0/0, and not a division by zero.
    expect(overall.accuracy).toBe(0.5);
  });

  it("splits totals by quiz type", () => {
    recordRun(choiceRun({ score: 9, total: 10 }));
    recordRun(pairsRun({ score: 1, total: 4 }));

    const { byType } = readStats();
    expect(byType.choice.accuracy).toBe(0.9);
    expect(byType.pairs.accuracy).toBe(0.25);
  });

  it("breaks a tie for best run in favour of the longer one", () => {
    recordRun(pairsRun({ score: 4, total: 4 }));
    recordRun(choiceRun({ score: 20, total: 20 }));

    expect(readStats().best.total).toBe(20);
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
});
