import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";
import { CalculationError } from "../src/errors.js";

/**
 * TC-025: Multiple ISINs — lots strictly isolated
 *
 * A BUY for ISIN-A must not be consumed by a SELL for ISIN-B.
 * When the Calculator processes a SELL for ISIN-B with no open lots for that
 * ISIN, it must throw a CalculationError whose .isin matches ISIN-B.
 *
 * Transactions:
 *   BUY  10 units of ISINA00000001 @ 100 EUR → lot open for ISIN-A only
 *   SELL 10 units of ISINB00000002 @ 100 EUR → no lot for ISIN-B → throws
 */

const buyA: Transaction = {
  isin: "ISINA00000001",
  product: "Stock A",
  date: "2024-01-02",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -1000,
  totalEUR: 1000,
  feesEUR: 0,
  fxRate: undefined,
};

const sellB: Transaction = {
  isin: "ISINB00000002",
  product: "Stock B",
  date: "2024-06-03",
  type: "SELL",
  quantity: 10,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: 1000,
  totalEUR: 1000,
  feesEUR: 0,
  fxRate: undefined,
};

describe("TC-025: Multiple ISINs — lots strictly isolated", () => {
  it("throws CalculationError when SELL ISIN has no open lots", () => {
    expect(() => new Calculator([buyA, sellB]).calculateGains("LIFO")).toThrow(
      CalculationError,
    );
  });

  it("thrown error references the SELL ISIN (ISINB00000002), not the BUY ISIN", () => {
    let err: CalculationError | undefined;
    try {
      new Calculator([buyA, sellB]).calculateGains("LIFO");
    } catch (e) {
      if (e instanceof CalculationError) err = e;
    }
    expect(err).toBeDefined();
    expect(err!.isin).toBe("ISINB00000002");
  });
});
