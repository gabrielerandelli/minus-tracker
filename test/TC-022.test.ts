import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";
import { CalculationError } from "../src/errors.js";

/**
 * TC-022 (AE-11): SELL with no open lots throws CalculationError
 *
 * A SELL transaction for an ISIN that has no prior BUY lots must throw
 * a CalculationError with the correct isin, date, and message fields.
 *
 * SELL: 2024-06-03 — 5 units @ 100 EUR, ISIN with no prior BUY
 *
 * Expected: CalculationError thrown with:
 *   message === "No open lots for ISIN ISIN_NO_LOTS on 2024-06-03"
 *   isin    === "ISIN_NO_LOTS"
 *   date    === "2024-06-03"
 */

const sell: Transaction = {
  isin: "ISIN_NO_LOTS",
  product: "Test",
  date: "2024-06-03",
  type: "SELL",
  quantity: 5,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: 500,
  totalEUR: 500,
  feesEUR: 0,
  fxRate: undefined,
};

describe("TC-022 (AE-11): SELL with no open lots throws CalculationError", () => {
  it("throws CalculationError when no prior BUY exists for the ISIN", () => {
    expect(() => new Calculator([sell]).calculateGains("LIFO")).toThrow(
      CalculationError,
    );
  });

  it("error.message === 'No open lots for ISIN ISIN_NO_LOTS on 2024-06-03'", () => {
    try {
      new Calculator([sell]).calculateGains("LIFO");
      throw new Error("Expected CalculationError but no error was thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CalculationError);
      expect((err as CalculationError).message).toBe(
        "No open lots for ISIN ISIN_NO_LOTS on 2024-06-03",
      );
    }
  });

  it("error.isin === 'ISIN_NO_LOTS'", () => {
    try {
      new Calculator([sell]).calculateGains("LIFO");
      throw new Error("Expected CalculationError but no error was thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CalculationError);
      expect((err as CalculationError).isin).toBe("ISIN_NO_LOTS");
    }
  });

  it("error.date === '2024-06-03'", () => {
    try {
      new Calculator([sell]).calculateGains("LIFO");
      throw new Error("Expected CalculationError but no error was thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CalculationError);
      expect((err as CalculationError).date).toBe("2024-06-03");
    }
  });
});
