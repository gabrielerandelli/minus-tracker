import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-013 (AE-02): LIFO single BUY/SELL EUR loss
 *
 * Simplest LIFO loss: one lot fully matched at a loss.
 *
 * BUY  10 units @ 100 EUR (totalEUR=1000, feesEUR=2) → buyCostEUR = 1000 + 2 = 1002
 * SELL 10 units @  80 EUR (totalEUR= 800, feesEUR=2) → sellProceedsEUR = 800 − 2 = 798
 * gainLossEUR = 798 − 1002 = −204.00
 *
 * Expected:
 *   report.plusvalenze  = 0
 *   report.minusvalenze = 204.00
 *   report.netResult    = −204.00
 *   report.lots.length  = 1
 *   report.lots[0].gainLossEUR = −204.00
 */

const buy: Transaction = {
  isin: "TEST000000002",
  product: "Test",
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
  isin: "TEST000000002",
  product: "Test",
  date: "2024-06-03",
  type: "SELL",
  quantity: 10,
  pricePerUnit: 80,
  currency: "EUR",
  totalLocal: 800,
  totalEUR: 800,
  feesEUR: 2,
  fxRate: undefined,
};

describe("TC-013 (AE-02): LIFO single BUY/SELL EUR loss", () => {
  const report = new Calculator([buy, sell]).calculateGains("LIFO");

  it("report.plusvalenze === 0", () => {
    expect(report.plusvalenze).toBe(0);
  });

  it("report.minusvalenze === 204.00", () => {
    expect(report.minusvalenze).toBe(204.0);
  });

  it("report.netResult === -204.00", () => {
    expect(report.netResult).toBe(-204.0);
  });

  it("report.lots.length === 1", () => {
    expect(report.lots).toHaveLength(1);
  });

  it("report.lots[0].gainLossEUR === -204.00", () => {
    expect(report.lots[0].gainLossEUR).toBe(-204.0);
  });
});
