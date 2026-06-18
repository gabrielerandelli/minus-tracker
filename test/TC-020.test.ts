import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-020 (AE-09): Mixed ISINs — gains and losses correctly isolated and totalled
 *
 * Two ISINs processed together. ISIN A produces a gain, ISIN B a loss.
 * The Calculator must:
 *   - Never assign a BUY lot from ISIN A to a SELL from ISIN B (or vice versa)
 *   - Sum only positive gainLoss into plusvalenze
 *   - Sum only |negative gainLoss| into minusvalenze
 *
 * ISIN A (AAA000000001) — gain:
 *   BUY  2024-01-02: 10 units @ 100 EUR, fees 2 EUR → buyCostEUR = 1002
 *   SELL 2024-06-03: 10 units @ 150 EUR, fees 2 EUR → sellProceedsEUR = 1498
 *   gainLossEUR = +496
 *
 * ISIN B (BBB000000002) — loss:
 *   BUY  2024-01-03: 5 units @ 200 EUR, fees 1 EUR → buyCostEUR = 1001
 *   SELL 2024-06-04: 5 units @ 180 EUR, fees 1 EUR → sellProceedsEUR = 899
 *   gainLossEUR = −102
 *
 * Expected report:
 *   plusvalenze  = 496.00
 *   minusvalenze = 102.00
 *   netResult    = 394.00
 *   lots.length  = 2
 */

// ISIN A — gain
const buyA: Transaction = {
  isin: "AAA000000001",
  product: "Stock A",
  date: "2024-01-02",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -1000,
  totalEUR: 1000,
  feesEUR: 2,
  fxRate: undefined,
};

const sellA: Transaction = {
  isin: "AAA000000001",
  product: "Stock A",
  date: "2024-06-03",
  type: "SELL",
  quantity: 10,
  pricePerUnit: 150,
  currency: "EUR",
  totalLocal: 1500,
  totalEUR: 1500,
  feesEUR: 2,
  fxRate: undefined,
};

// ISIN B — loss
const buyB: Transaction = {
  isin: "BBB000000002",
  product: "Stock B",
  date: "2024-01-03",
  type: "BUY",
  quantity: 5,
  pricePerUnit: 200,
  currency: "EUR",
  totalLocal: -1000,
  totalEUR: 1000,
  feesEUR: 1,
  fxRate: undefined,
};

const sellB: Transaction = {
  isin: "BBB000000002",
  product: "Stock B",
  date: "2024-06-04",
  type: "SELL",
  quantity: 5,
  pricePerUnit: 180,
  currency: "EUR",
  totalLocal: 900,
  totalEUR: 900,
  feesEUR: 1,
  fxRate: undefined,
};

describe("TC-020 (AE-09): Mixed ISINs — gains and losses correctly isolated and totalled", () => {
  const report = new Calculator([buyA, sellA, buyB, sellB]).calculateGains(
    "LIFO",
  );

  it("lots.length === 2 (one per ISIN)", () => {
    expect(report.lots.length).toBe(2);
  });

  it("ISIN A lot: buyCostEUR = 1002", () => {
    const lotA = report.lots.find((l) => l.isin === "AAA000000001");
    expect(lotA?.buyCostEUR).toBe(1002);
  });

  it("ISIN A lot: sellProceedsEUR = 1498", () => {
    const lotA = report.lots.find((l) => l.isin === "AAA000000001");
    expect(lotA?.sellProceedsEUR).toBe(1498);
  });

  it("ISIN A lot: gainLossEUR = +496", () => {
    const lotA = report.lots.find((l) => l.isin === "AAA000000001");
    expect(lotA?.gainLossEUR).toBe(496);
  });

  it("ISIN B lot: buyCostEUR = 1001", () => {
    const lotB = report.lots.find((l) => l.isin === "BBB000000002");
    expect(lotB?.buyCostEUR).toBe(1001);
  });

  it("ISIN B lot: sellProceedsEUR = 899", () => {
    const lotB = report.lots.find((l) => l.isin === "BBB000000002");
    expect(lotB?.sellProceedsEUR).toBe(899);
  });

  it("ISIN B lot: gainLossEUR = −102", () => {
    const lotB = report.lots.find((l) => l.isin === "BBB000000002");
    expect(lotB?.gainLossEUR).toBe(-102);
  });

  it("plusvalenze = 496.00", () => {
    expect(report.plusvalenze).toBe(496.0);
  });

  it("minusvalenze = 102.00", () => {
    expect(report.minusvalenze).toBe(102.0);
  });

  it("netResult = 394.00", () => {
    expect(report.netResult).toBe(394.0);
  });

  it("no cross-ISIN lot assignment — every lot isin matches its buy isin", () => {
    for (const lot of report.lots) {
      if (lot.isin === "AAA000000001") {
        expect(lot.buyDate).toBe(buyA.date);
        expect(lot.sellDate).toBe(sellA.date);
      } else if (lot.isin === "BBB000000002") {
        expect(lot.buyDate).toBe(buyB.date);
        expect(lot.sellDate).toBe(sellB.date);
      } else {
        throw new Error(`Unexpected isin in lot: ${lot.isin}`);
      }
    }
  });
});
