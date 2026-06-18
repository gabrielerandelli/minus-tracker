import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-014 (AE-03): LIFO multiple BUYs — LIFO match order verified
 *
 * Two BUY lots; SELL matches BUY 2 (most recent) only under LIFO.
 *
 * BUY 1: 2024-01-02 — 10 units @ 100 EUR (totalEUR=1000, feesEUR=2)
 * BUY 2: 2024-03-01 — 10 units @ 120 EUR (totalEUR=1200, feesEUR=2)
 * SELL:  2024-06-03 — 10 units @ 130 EUR (totalEUR=1300, feesEUR=2)
 *
 * LIFO picks BUY 2 (most recent):
 *   pricePerUnitEUR(BUY2) = 1200 / 10 = 120
 *   pricePerUnitEUR(SELL) = 1300 / 10 = 130
 *   buyCostEUR      = 10 × 120 + 2 = 1202.00
 *   sellProceedsEUR = 10 × 130 − 2 = 1298.00
 *   gainLossEUR     = 96.00
 *
 * Expected:
 *   report.lots.length  = 1
 *   report.lots[0].buyDate    = "2024-03-01"   ← BUY 2 matched, not BUY 1
 *   report.lots[0].gainLossEUR = 96.00
 *   report.plusvalenze  = 96.00
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

describe("TC-014 (AE-03): LIFO multiple BUYs — LIFO match order verified", () => {
  const report = new Calculator([buy1, buy2, sell]).calculateGains("LIFO");

  it("report.lots.length === 1", () => {
    expect(report.lots).toHaveLength(1);
  });

  it('report.lots[0].buyDate === "2024-03-01" (BUY 2 matched, not BUY 1)', () => {
    expect(report.lots[0].buyDate).toBe("2024-03-01");
  });

  it("report.lots[0].gainLossEUR === 96.00", () => {
    expect(report.lots[0].gainLossEUR).toBe(96.0);
  });

  it("report.plusvalenze === 96.00", () => {
    expect(report.plusvalenze).toBe(96.0);
  });
});
