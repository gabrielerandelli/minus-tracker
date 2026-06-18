import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-016 (AE-05): LIFO partial lot consumption
 *
 * SELL quantity (10) is less than the BUY lot quantity (20). Lot remains partially open.
 *
 * BUY:  2024-01-02 — 20 units @ 100 EUR (totalEUR=2000, feesEUR=4)
 * SELL: 2024-06-03 — 10 units @ 150 EUR (totalEUR=1500, feesEUR=2)
 *
 * 10 of 20 BUY shares matched (partial consumption):
 *   pricePerUnitEUR(BUY) = 2000 / 20 = 100
 *   allocatedBuyFees  = 4 × (10/20) = 2.00   [uses originalQty=20]
 *   allocatedSellFees = 2 × (10/10) = 2.00
 *   buyCostEUR      = 10 × 100 + 2.00 = 1002.00
 *   sellProceedsEUR = 10 × 150 − 2.00 = 1498.00
 *   gainLossEUR     = 496.00
 *
 * Expected:
 *   report.lots.length         = 1
 *   report.lots[0].gainLossEUR = 496.00
 *   report.plusvalenze         = 496.00
 */

const buy: Transaction = {
  isin: "TEST000000004",
  product: "Test",
  date: "2024-01-02",
  type: "BUY",
  quantity: 20,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -2000,
  totalEUR: 2000,
  feesEUR: 4,
  fxRate: undefined,
};

const sell: Transaction = {
  isin: "TEST000000004",
  product: "Test",
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

describe("TC-016 (AE-05): LIFO partial lot consumption", () => {
  const report = new Calculator([buy, sell]).calculateGains("LIFO");

  it("report.lots.length === 1", () => {
    expect(report.lots).toHaveLength(1);
  });

  it("report.lots[0].gainLossEUR === 496.00", () => {
    expect(report.lots[0].gainLossEUR).toBe(496.0);
  });

  it("report.plusvalenze === 496.00", () => {
    expect(report.plusvalenze).toBe(496.0);
  });
});
