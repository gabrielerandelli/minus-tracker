import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-024: Same-day BUY and SELL — BUY processed first
 *
 * BUY and SELL share the same date (2024-06-03). The Calculator must sort
 * BUY before SELL regardless of the input order, so the lot is open before
 * the SELL tries to consume it.
 *
 * BUY  10 units @ 100 EUR (feesEUR=0) → buyCostEUR  = 1000
 * SELL 10 units @ 120 EUR (feesEUR=0) → sellProceedsEUR = 1200
 * gainLossEUR = 1200 − 1000 = 200.00
 *
 * Verified for both input orderings:
 *   [buy, sell] → plusvalenze === 200.00
 *   [sell, buy] → plusvalenze === 200.00  (Calculator sorts internally)
 */

const buy: Transaction = {
  isin: "TEST000000008",
  product: "Test",
  date: "2024-06-03",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -1000,
  totalEUR: 1000,
  feesEUR: 0,
  fxRate: undefined,
};

const sell: Transaction = {
  isin: "TEST000000008",
  product: "Test",
  date: "2024-06-03",
  type: "SELL",
  quantity: 10,
  pricePerUnit: 120,
  currency: "EUR",
  totalLocal: 1200,
  totalEUR: 1200,
  feesEUR: 0,
  fxRate: undefined,
};

describe("TC-024: Same-day BUY and SELL — BUY processed first", () => {
  describe("Input order: [buy, sell]", () => {
    it("does not throw CalculationError", () => {
      expect(() =>
        new Calculator([buy, sell]).calculateGains("LIFO"),
      ).not.toThrow();
    });

    it("report.plusvalenze === 200.00", () => {
      const report = new Calculator([buy, sell]).calculateGains("LIFO");
      expect(report.plusvalenze).toBe(200.0);
    });

    it("report.lots.length === 1", () => {
      const report = new Calculator([buy, sell]).calculateGains("LIFO");
      expect(report.lots).toHaveLength(1);
    });
  });

  describe("Input order: [sell, buy] — Calculator sorts internally", () => {
    it("does not throw CalculationError", () => {
      expect(() =>
        new Calculator([sell, buy]).calculateGains("LIFO"),
      ).not.toThrow();
    });

    it("report.plusvalenze === 200.00", () => {
      const report = new Calculator([sell, buy]).calculateGains("LIFO");
      expect(report.plusvalenze).toBe(200.0);
    });

    it("report.lots.length === 1", () => {
      const report = new Calculator([sell, buy]).calculateGains("LIFO");
      expect(report.lots).toHaveLength(1);
    });
  });
});
