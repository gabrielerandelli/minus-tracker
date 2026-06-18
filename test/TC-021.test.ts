import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-021 (AE-10): Brokerage fees included in cost basis
 *
 * Identical buy and sell prices — fees are the sole source of loss.
 *
 * BUY:  2024-01-02 — 10 units @ 100 EUR, feesEUR=5
 * SELL: 2024-06-03 — 10 units @ 100 EUR, feesEUR=5
 *
 * Calculation:
 *   buyCostEUR      = 10 × 100 + 5 = 1005.00
 *   sellProceedsEUR = 10 × 100 − 5 =  995.00
 *   gainLossEUR     = 995.00 − 1005.00 = −10.00
 *
 * Expected report:
 *   plusvalenze  = 0
 *   minusvalenze = 10.00
 *   netResult    = −10.00
 *   lots.length  = 1
 *
 * Fixture reference: test/fixtures/ae/ae-10.csv (ISIN TEST000000010 / Test Stock J —
 * same math; spec uses TEST000000007 / Test as the inline transaction label).
 */

const buy: Transaction = {
  isin: "TEST000000007",
  product: "Test",
  date: "2024-01-02",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -1000,
  totalEUR: 1000,
  feesEUR: 5,
  fxRate: undefined,
};

const sell: Transaction = {
  isin: "TEST000000007",
  product: "Test",
  date: "2024-06-03",
  type: "SELL",
  quantity: 10,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: 1000,
  totalEUR: 1000,
  feesEUR: 5,
  fxRate: undefined,
};

describe("TC-021 (AE-10): Brokerage fees included in cost basis", () => {
  const report = new Calculator([buy, sell]).calculateGains("LIFO");

  it("lots.length === 1", () => {
    expect(report.lots.length).toBe(1);
  });

  it("buyCostEUR = 1005.00 (10 × 100 + 5)", () => {
    expect(report.lots[0].buyCostEUR).toBe(1005);
  });

  it("sellProceedsEUR = 995.00 (10 × 100 − 5)", () => {
    expect(report.lots[0].sellProceedsEUR).toBe(995);
  });

  it("gainLossEUR = −10.00 (fees are sole source of loss)", () => {
    expect(report.lots[0].gainLossEUR).toBe(-10);
  });

  it("plusvalenze = 0 (no gain despite identical prices)", () => {
    expect(report.plusvalenze).toBe(0);
  });

  it("minusvalenze = 10.00", () => {
    expect(report.minusvalenze).toBe(10);
  });

  it("netResult = −10.00", () => {
    expect(report.netResult).toBe(-10);
  });
});
