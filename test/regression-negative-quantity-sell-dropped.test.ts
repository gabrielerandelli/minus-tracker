import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";
import { CalculationError } from "../src/errors.js";

/**
 * Regression: negative-quantity SELL silently dropped from the tax report
 *
 * `Transaction.quantity` (src/types.ts, around line 219) is documented as
 * "always positive" — an explicit invariant of the public contract. Nothing
 * in `Calculator.calculateGains()` previously validated it.
 *
 * A buggy community broker-adapter (per AGENTS.md's "extensible to other
 * brokers via community PRs" note) can map a raw export's signed Quantity
 * column straight through without taking Math.abs() on the SELL side,
 * producing a SELL transaction with a negative `quantity`.
 *
 * Confirmed repro, using the real public API exactly as documented
 * (`new Calculator(transactions).calculateGains("LIFO")`):
 *
 *   BUY  ISIN FR0000120321, quantity=10,  totalEUR=1000, date 2024-03-01
 *   SELL ISIN FR0000120321, quantity=-10 (BUG: should be +10), totalEUR=1200,
 *        date 2024-06-01
 *
 * Root cause: the SELL branch's lot-matching loop is
 * `while (remainingSellQty > 0) { ... }`. When `remainingSellQty` (==
 * tx.quantity) starts negative, the loop body never executes even once, so
 * the SELL is a complete no-op and the matching open BUY lot is left
 * dangling, unconsumed, with no warning emitted.
 *
 * Before the fix, `calculateGains("LIFO")` returned
 * `{ plusvalenze: 0, minusvalenze: 0, netResult: 0, lots: [] }` — completely
 * silent, no error, no warning. The real EUR 200 gain (1200 proceeds - 1000
 * cost) vanished from the tax report with zero diagnostic trail.
 *
 * Fixed behavior: a non-positive `quantity` on a SELL (or a BUY — see the
 * sibling test below) is rejected loudly with
 * `CalculationError`, `.code === "INVALID_QUANTITY"`, consistent with how
 * the library already rejects other invalid input (`NO_OPEN_LOTS`,
 * `AMBIGUOUS_TAX_YEAR`, `INVALID_TAX_RATE`).
 */

const buy: Transaction = {
  isin: "FR0000120321",
  product: "L'Oréal",
  date: "2024-03-01",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -1000,
  totalEUR: 1000,
  feesEUR: 0,
  fxRate: undefined,
};

const negativeSell: Transaction = {
  isin: "FR0000120321",
  product: "L'Oréal",
  date: "2024-06-15",
  type: "SELL",
  quantity: -10, // BUG: should be +10
  pricePerUnit: 120,
  currency: "EUR",
  totalLocal: 1200,
  totalEUR: 1200,
  feesEUR: 0,
  fxRate: undefined,
};

describe("Regression: negative-quantity SELL is rejected, not silently dropped", () => {
  it("throws CalculationError with code INVALID_QUANTITY, not a silent zero report", () => {
    expect(() =>
      new Calculator([buy, negativeSell]).calculateGains("LIFO"),
    ).toThrow(CalculationError);
  });

  it("the thrown error precisely identifies the offending SELL transaction", () => {
    try {
      new Calculator([buy, negativeSell]).calculateGains("LIFO");
      expect.fail("Expected calculateGains to throw, but it did not");
    } catch (err) {
      expect(err).toBeInstanceOf(CalculationError);
      const error = err as CalculationError;
      expect(error.code).toBe("INVALID_QUANTITY");
      expect(error.isin).toBe("FR0000120321");
      expect(error.date).toBe("2024-06-15");
      expect(error.quantity).toBe(-10);
      expect(error.transactionType).toBe("SELL");
    }
  });

  it("FIFO is rejected the same way as LIFO", () => {
    expect(() =>
      new Calculator([buy, negativeSell]).calculateGains("FIFO"),
    ).toThrow(CalculationError);
  });
});

describe("Regression: negative-quantity BUY is also rejected (not just SELL)", () => {
  const negativeBuy: Transaction = {
    ...buy,
    quantity: -10,
  };
  const positiveSell: Transaction = {
    ...negativeSell,
    quantity: 10,
  };

  it("throws CalculationError with code INVALID_QUANTITY, identifying the BUY", () => {
    try {
      new Calculator([negativeBuy, positiveSell]).calculateGains("LIFO");
      expect.fail("Expected calculateGains to throw, but it did not");
    } catch (err) {
      expect(err).toBeInstanceOf(CalculationError);
      const error = err as CalculationError;
      expect(error.code).toBe("INVALID_QUANTITY");
      expect(error.isin).toBe("FR0000120321");
      expect(error.date).toBe("2024-03-01");
      expect(error.quantity).toBe(-10);
      expect(error.transactionType).toBe("BUY");
    }
  });
});

describe("Regression: zero or NaN quantity is rejected the same way", () => {
  it("rejects a zero-quantity SELL with INVALID_QUANTITY", () => {
    expect(() =>
      new Calculator([buy, { ...negativeSell, quantity: 0 }]).calculateGains(
        "LIFO",
      ),
    ).toThrow(CalculationError);
  });

  it("rejects a NaN-quantity SELL (NaN <= 0 is false, so a naive `<= 0` guard would miss it)", () => {
    try {
      new Calculator([
        buy,
        { ...negativeSell, quantity: NaN },
      ]).calculateGains("LIFO");
      expect.fail("Expected calculateGains to throw, but it did not");
    } catch (err) {
      expect(err).toBeInstanceOf(CalculationError);
      const error = err as CalculationError;
      expect(error.code).toBe("INVALID_QUANTITY");
      expect(error.transactionType).toBe("SELL");
    }
  });
});

describe("Sanity: a correctly-signed (positive) SELL still works as before", () => {
  it("computes the real EUR 200 gain instead of vanishing", () => {
    const report = new Calculator([
      buy,
      { ...negativeSell, quantity: 10 },
    ]).calculateGains("LIFO");
    expect(report.plusvalenze).toBe(200);
    expect(report.minusvalenze).toBe(0);
    expect(report.netResult).toBe(200);
    expect(report.lots).toHaveLength(1);
  });
});
