import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-012 (AE-01): LIFO single BUY/SELL EUR gain
 *
 * Simplest LIFO gain: one lot fully matched.
 *
 * BUY  10 units @ 100 EUR (totalEUR=1000, feesEUR=2) → buyCostEUR = 1000 + 2 = 1002
 * SELL 10 units @ 150 EUR (totalEUR=1500, feesEUR=2) → sellProceedsEUR = 1500 − 2 = 1498
 * gainLossEUR = 1498 − 1002 = 496.00
 *
 * Expected:
 *   report.plusvalenze  = 496.00
 *   report.minusvalenze = 0
 *   report.netResult    = 496.00
 *   report.lots.length  = 1
 *   report.lots[0].gainLossEUR = 496.00
 */

const buy: Transaction = {
  isin: "TEST000000001",
  product: "Test Stock A",
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

const sell: Transaction = {
  isin: "TEST000000001",
  product: "Test Stock A",
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

describe("TC-012 (AE-01): LIFO single BUY/SELL EUR gain", () => {
  const report = new Calculator([buy, sell]).calculateGains("LIFO");

  it("report.plusvalenze === 496.00", () => {
    expect(report.plusvalenze).toBe(496.0);
  });

  it("report.minusvalenze === 0", () => {
    expect(report.minusvalenze).toBe(0);
  });

  it("report.netResult === 496.00", () => {
    expect(report.netResult).toBe(496.0);
  });

  it("report.lots.length === 1", () => {
    expect(report.lots).toHaveLength(1);
  });

  it("report.lots[0].gainLossEUR === 496.00", () => {
    expect(report.lots[0].gainLossEUR).toBe(496.0);
  });
});
