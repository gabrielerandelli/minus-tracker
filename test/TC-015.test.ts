import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-015 (AE-04): FIFO multiple BUYs — FIFO match order verified
 *
 * Same transactions as TC-014; SELL must match BUY 1 (oldest) under FIFO.
 *
 * BUY 1: 2024-01-02 — 10 units @ 100 EUR (totalEUR=1000, feesEUR=2)
 * BUY 2: 2024-03-01 — 10 units @ 120 EUR (totalEUR=1200, feesEUR=2)
 * SELL:  2024-06-03 — 10 units @ 130 EUR (totalEUR=1300, feesEUR=2)
 *
 * FIFO picks BUY 1 (oldest):
 *   pricePerUnitEUR(BUY1) = 1000 / 10 = 100
 *   pricePerUnitEUR(SELL) = 1300 / 10 = 130
 *   buyCostEUR      = 10 × 100 + 2 = 1002.00
 *   sellProceedsEUR = 10 × 130 − 2 = 1298.00
 *   gainLossEUR     = 296.00
 *
 * Expected:
 *   report.lots.length         = 1
 *   report.lots[0].buyDate     = "2024-01-02"   ← BUY 1 matched, not BUY 2
 *   report.lots[0].gainLossEUR = 296.00
 *   report.plusvalenze         = 296.00
 */

const buy1: Transaction = {
  isin: "TEST000000003",
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

const buy2: Transaction = {
  isin: "TEST000000003",
  product: "Test",
  date: "2024-03-01",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 120,
  currency: "EUR",
  totalLocal: -1200,
  totalEUR: 1200,
  feesEUR: 2,
  fxRate: undefined,
};

const sell: Transaction = {
  isin: "TEST000000003",
  product: "Test",
  date: "2024-06-03",
  type: "SELL",
  quantity: 10,
  pricePerUnit: 130,
  currency: "EUR",
  totalLocal: 1300,
  totalEUR: 1300,
  feesEUR: 2,
  fxRate: undefined,
};

describe("TC-015 (AE-04): FIFO multiple BUYs — FIFO match order verified", () => {
  const report = new Calculator([buy1, buy2, sell]).calculateGains("FIFO");

  it("report.lots.length === 1", () => {
    expect(report.lots).toHaveLength(1);
  });

  it('report.lots[0].buyDate === "2024-01-02" (BUY 1 matched, not BUY 2)', () => {
    expect(report.lots[0].buyDate).toBe("2024-01-02");
  });

  it("report.lots[0].gainLossEUR === 296.00", () => {
    expect(report.lots[0].gainLossEUR).toBe(296.0);
  });

  it("report.plusvalenze === 296.00", () => {
    expect(report.plusvalenze).toBe(296.0);
  });
});
