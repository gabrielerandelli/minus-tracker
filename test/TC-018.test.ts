import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-018 (AE-07): Multi-currency USD BUY and SELL with ECB conversion
 *
 * Both legs are in USD. EUR values are pre-computed from stub ECB rates:
 *   USD "2024-01-02" = 1.25  → BUY  totalEUR = 1000 / 1.25 = 800.00
 *   USD "2024-06-03" = 1.00  → SELL totalEUR = 1200 / 1.00 = 1200.00
 *
 * BUY:  2024-01-02 — 10 units @ 100 USD (totalEUR=800.00,  feesEUR=1, fxRate=1.25)
 * SELL: 2024-06-03 — 10 units @ 120 USD (totalEUR=1200.00, feesEUR=1, fxRate=1.00)
 *
 * Calculation:
 *   pricePerUnitEUR(BUY)  = 800  / 10 =  80.00
 *   pricePerUnitEUR(SELL) = 1200 / 10 = 120.00
 *   buyCostEUR      = 10 × 80  + 1 =  801.00
 *   sellProceedsEUR = 10 × 120 − 1 = 1199.00
 *   gainLossEUR     = 1199.00 − 801.00 = 398.00
 *
 * Expected:
 *   report.lots[0].buyFxRate              = 1.25
 *   report.lots[0].sellFxRate             = 1.00
 *   report.ratesUsed["USD:2024-01-02"]    = 1.25
 *   report.ratesUsed["USD:2024-06-03"]    = 1.00
 *   report.plusvalenze                    = 398.00
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
  totalEUR: 800.0, // 1000 / 1.25
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
  totalEUR: 1200.0, // 1200 / 1.0
  feesEUR: 1,
  fxRate: 1.0,
};

describe("TC-018 (AE-07): Multi-currency USD BUY and SELL with ECB conversion", () => {
  const report = new Calculator([buy, sell]).calculateGains("LIFO");

  it("report.lots[0].buyFxRate === 1.25", () => {
    expect(report.lots[0].buyFxRate).toBe(1.25);
  });

  it("report.lots[0].sellFxRate === 1.00", () => {
    expect(report.lots[0].sellFxRate).toBe(1.0);
  });

  it('report.ratesUsed["USD:2024-01-02"] === 1.25', () => {
    expect(report.ratesUsed["USD:2024-01-02"]).toBe(1.25);
  });

  it('report.ratesUsed["USD:2024-06-03"] === 1.00', () => {
    expect(report.ratesUsed["USD:2024-06-03"]).toBe(1.0);
  });

  it("report.plusvalenze === 398.00", () => {
    expect(report.plusvalenze).toBe(398.0);
  });
});
