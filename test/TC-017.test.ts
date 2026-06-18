import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-017 (AE-06): LIFO SELL consumes multiple lots
 *
 * A single SELL (10 units) exhausts BUY 2 (8 units) then partially consumes BUY 1 (5 units, taking 2).
 *
 * BUY 1: 2024-01-02 — 5  units @ 100 EUR (totalEUR=500,  feesEUR=1)
 * BUY 2: 2024-03-01 — 8  units @ 120 EUR (totalEUR=960,  feesEUR=1.6)
 * SELL:  2024-06-03 — 10 units @ 130 EUR (totalEUR=1300, feesEUR=2)
 *
 * LIFO order: first exhaust BUY 2 (most recent), then take 2 from BUY 1.
 *
 * Lot 1 (from BUY 2, 8 shares fully consumed):
 *   pricePerUnitEUR(BUY2) = 960 / 8 = 120
 *   allocatedBuyFees  = 1.6 × (8/8)  = 1.60
 *   allocatedSellFees = 2   × (8/10) = 1.60
 *   buyCostEUR      = 8 × 120 + 1.60 = 961.60
 *   sellProceedsEUR = 8 × 130 − 1.60 = 1038.40
 *   gainLossEUR     = 76.80
 *
 * Lot 2 (from BUY 1, 2 of 5 shares consumed):
 *   pricePerUnitEUR(BUY1) = 500 / 5 = 100
 *   allocatedBuyFees  = 1 × (2/5)  = 0.40  [originalQty=5]
 *   allocatedSellFees = 2 × (2/10) = 0.40
 *   buyCostEUR      = 2 × 100 + 0.40 = 200.40
 *   sellProceedsEUR = 2 × 130 − 0.40 = 259.60
 *   gainLossEUR     = 59.20
 *
 * Expected:
 *   report.lots.length         = 2
 *   report.lots[0].gainLossEUR = 76.80  (BUY 2, consumed first by LIFO)
 *   report.lots[1].gainLossEUR = 59.20  (BUY 1, partial)
 *   report.plusvalenze         = 136.00
 */

const buy1: Transaction = {
  isin: "TEST000000005",
  product: "Test",
  date: "2024-01-02",
  type: "BUY",
  quantity: 5,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -500,
  totalEUR: 500,
  feesEUR: 1,
  fxRate: undefined,
};

const buy2: Transaction = {
  isin: "TEST000000005",
  product: "Test",
  date: "2024-03-01",
  type: "BUY",
  quantity: 8,
  pricePerUnit: 120,
  currency: "EUR",
  totalLocal: -960,
  totalEUR: 960,
  feesEUR: 1.6,
  fxRate: undefined,
};

const sell: Transaction = {
  isin: "TEST000000005",
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

describe("TC-017 (AE-06): LIFO SELL consumes multiple lots", () => {
  const report = new Calculator([buy1, buy2, sell]).calculateGains("LIFO");

  it("report.lots.length === 2", () => {
    expect(report.lots).toHaveLength(2);
  });

  it("report.lots[0].gainLossEUR === 76.80 (BUY 2 fully consumed)", () => {
    expect(report.lots[0].gainLossEUR).toBe(76.8);
  });

  it("report.lots[1].gainLossEUR === 59.20 (BUY 1 partially consumed)", () => {
    expect(report.lots[1].gainLossEUR).toBe(59.2);
  });

  it("report.plusvalenze === 136.00", () => {
    expect(report.plusvalenze).toBe(136.0);
  });
});
