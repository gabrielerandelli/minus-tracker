import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-019 (AE-08): Different ECB rates per leg verified in MatchedLot
 *
 * Same setup as TC-018. The key assertion here is that the library
 * stores a distinct fxRate per leg — it never re-uses the BUY rate
 * for the SELL leg or vice versa.
 *
 * BUY:  2024-01-02 — 10 units @ 100 USD (totalEUR=800.00, feesEUR=1, fxRate=1.25)
 * SELL: 2024-06-03 — 10 units @ 120 USD (totalEUR=1200.00, feesEUR=1, fxRate=1.00)
 *
 * Expected (FX rate assertions):
 *   report.lots[0].buyFxRate  = 1.25
 *   report.lots[0].sellFxRate = 1.00
 *   buyFxRate !== sellFxRate  → true
 */

const buy: Transaction = {
  isin: "TEST000000006",
  product: "Test",
  date: "2024-01-02",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 100,
  currency: "USD",
  totalLocal: -1000,
  totalEUR: 800.0,
  feesEUR: 1,
  fxRate: 1.25,
};

const sell: Transaction = {
  isin: "TEST000000006",
  product: "Test",
  date: "2024-06-03",
  type: "SELL",
  quantity: 10,
  pricePerUnit: 120,
  currency: "USD",
  totalLocal: 1200,
  totalEUR: 1200.0,
  feesEUR: 1,
  fxRate: 1.0,
};

describe("TC-019 (AE-08): Different ECB rates per leg verified in MatchedLot", () => {
  const report = new Calculator([buy, sell]).calculateGains("LIFO");

  it("report.lots[0].buyFxRate === 1.25", () => {
    expect(report.lots[0].buyFxRate).toBe(1.25);
  });

  it("report.lots[0].sellFxRate === 1.00", () => {
    expect(report.lots[0].sellFxRate).toBe(1.0);
  });

  it("buyFxRate !== sellFxRate (rates are stored independently per leg)", () => {
    expect(report.lots[0].buyFxRate).not.toBe(report.lots[0].sellFxRate);
  });
});
