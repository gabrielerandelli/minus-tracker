import { describe, it, expect } from "vitest";
import { isSnapshotStale } from "../src/rates/index.js";
import { fetchEcbData } from "../src/cli/commands/rates.js";

/**
 * TC-041: rates --update pipeline — staleness detection and ECB fetch
 *
 * Unit: isSnapshotStale(snapshot, today) classifies snapshots correctly.
 * Integration: fetchEcbData("USD") hits the real ECB SDMX API and returns
 * well-formed historical rates. This guards against CSV format regressions
 * (the v0.5.5 bug: wrong column indices returned 0 dates on every --update).
 */

// ---------- helpers --------------------------------------------------------

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const TODAY = new Date().toISOString().slice(0, 10);

// ---------- Unit: isSnapshotStale ------------------------------------------

describe("TC-041a: isSnapshotStale — unit", () => {
  it("empty snapshot is stale", () => {
    expect(isSnapshotStale({})).toBe(true);
  });

  it("snapshot with no dates per currency is stale", () => {
    expect(isSnapshotStale({ USD: {}, GBP: {}, CHF: {} })).toBe(true);
  });

  it("snapshot whose most recent date is today is not stale", () => {
    expect(isSnapshotStale({ USD: { [TODAY]: 1.1 } })).toBe(false);
  });

  it("snapshot whose most recent date is 6 days ago is not stale", () => {
    expect(isSnapshotStale({ USD: { [daysAgo(6)]: 1.1 } })).toBe(false);
  });

  it("snapshot whose most recent date is exactly 7 days ago is stale", () => {
    expect(isSnapshotStale({ USD: { [daysAgo(7)]: 1.1 } })).toBe(true);
  });

  it("snapshot whose most recent date is 30 days ago is stale", () => {
    expect(isSnapshotStale({ USD: { [daysAgo(30)]: 1.1 } })).toBe(true);
  });

  it("uses the maximum date across all currencies", () => {
    const snapshot = {
      USD: { [daysAgo(30)]: 1.1 },
      GBP: { [daysAgo(3)]: 0.85 }, // most recent — within 7 days
    };
    expect(isSnapshotStale(snapshot)).toBe(false);
  });

  it("accepts an explicit today override for deterministic tests", () => {
    const snap = { USD: { "2024-01-10": 1.09 } };
    expect(isSnapshotStale(snap, "2024-01-15")).toBe(false); // 5 days — not stale
    expect(isSnapshotStale(snap, "2024-01-18")).toBe(true); // 8 days — stale
  });
});

// ---------- Integration: fetchEcbData (real ECB API) -----------------------

describe(
  "TC-041b: fetchEcbData — integration (real ECB API)",
  { timeout: 30000 },
  () => {
    it("returns a non-empty rates object for USD", async () => {
      const rates = await fetchEcbData("USD");
      expect(Object.keys(rates).length).toBeGreaterThan(0);
    });

    it("all keys are YYYY-MM-DD dates", async () => {
      const rates = await fetchEcbData("USD");
      for (const key of Object.keys(rates)) {
        expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it("all values are finite positive numbers", async () => {
      const rates = await fetchEcbData("USD");
      for (const val of Object.values(rates)) {
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThan(0);
      }
    });

    it("coverage starts at or before 2023-01-01 (startPeriod=2019-01-01 regression guard)", async () => {
      const rates = await fetchEcbData("USD");
      const minDate = Object.keys(rates).sort()[0];
      expect(minDate <= "2023-01-01").toBe(true);
    });
  },
);
