import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-042: Sample file end-to-end smoke test
 *
 * Reads samples/sample-trades.csv from the filesystem (verifies packaging),
 * parses it with stub ECB rates for deterministic arithmetic, then runs the
 * Calculator in LIFO mode and asserts the report shape.
 *
 * Stub rates used (not real ECB values):
 *   USD 2024-01-02 = 1.25   → AAPL BUY  totalEUR = 1500 / 1.25 = 1200.00
 *   USD 2024-01-05 = 1.0941 → AAPL SELL totalEUR = 1300 / 1.0941 ≈ 1188.19
 *
 * ASML rows are EUR-denominated → no stub rate needed.
 *
 * Expected LIFO output:
 *   AAPL lot:  buyCost=1202, sellProceeds≈1186.19 → loss≈15.81
 *   ASML lot A (3 from BUY2): buyCost=2552, sellProceeds=2849 → gain=297.00
 *   ASML lot B (3 from BUY1): buyCost=4002*(3/5)=2401.20, sellProceeds=2849 → gain=447.80
 *   plusvalenze=744.80, minusvalenze≈15.81, netResult>0
 */

const STUB_RATES = {
  USD: {
    "2024-01-02": 1.25,
    "2024-01-05": 1.0941,
  },
};

const csv = readFileSync(
  new URL("../samples/sample-trades.csv", import.meta.url),
  "utf-8",
);

describe("TC-042: sample-trades.csv end-to-end smoke test", () => {
  const parser = new DEGIROParser(STUB_RATES);
  const transactions = parser.parse(csv);
  const report = new Calculator(transactions).calculateGains("LIFO");

  it("Step 1: parses 5 transactions from the sample file", () => {
    expect(transactions).toHaveLength(5);
  });

  it("Step 2: no parse warnings", () => {
    expect(parser.warnings).toHaveLength(0);
  });

  it("Step 3: report has 3 matched lots (1 AAPL + 2 ASML)", () => {
    expect(report.lots).toHaveLength(3);
  });

  it("Step 4: plusvalenze ≈ 744.80 (ASML LIFO gain)", () => {
    expect(report.plusvalenze).toBeCloseTo(744.8, 1);
  });

  it("Step 5: minusvalenze ≈ 15.81 (AAPL USD loss)", () => {
    expect(report.minusvalenze).toBeCloseTo(15.81, 1);
  });

  it("Step 6: netResult > 0 (gains exceed loss)", () => {
    expect(report.netResult).toBeGreaterThan(0);
  });

  it("Step 7: no calculation warnings", () => {
    expect(report.warnings).toHaveLength(0);
  });

  it("Step 8: method is LIFO", () => {
    expect(report.method).toBe("LIFO");
  });
});
