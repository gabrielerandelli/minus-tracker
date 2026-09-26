import { describe, it, expect } from "vitest";
import type { Transaction, ClassificationMap } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * Regression: future-dated (or same-year) carryforward entry must not be
 * applied
 *
 * A carryForward entry is only eligible to offset a report's plusvalenze
 * when it was realized 1 to 4 tax years BEFORE the report's taxYear (Art.
 * 68 co.5 TUIR): 1 <= taxYear - entry.year <= 4. An entry dated the same
 * year as, or after, taxYear must be skipped exactly like an expired
 * (too-old) entry — see test/TC-059.test.ts for that sibling case.
 *
 * US0378331005 (Stock, bucketGain=B): BUY 5@200 (2023-01-10),
 * SELL 5@300 (2023-06-15) → plusvalenze = 500 EUR, taxYear = 2023
 *
 * Bug: carryForward: [{year: 2026, amount: 1000}] (3 years IN THE FUTURE
 * relative to the 2023 report) was incorrectly applied, wiping out the
 * genuine 2023 gain (bucketB.netResult === 0 instead of 500).
 */

const STUB_CLASSIFICATION: ClassificationMap = {
  US0378331005: {
    product: "Apple Inc",
    assetClass: "Stock",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
    confirmedByUser: true,
    source: "openfigi",
  },
};

const buy: Transaction = {
  isin: "US0378331005",
  product: "Apple Inc",
  date: "2023-01-10",
  type: "BUY",
  quantity: 5,
  pricePerUnit: 200,
  currency: "EUR",
  totalLocal: -1000,
  totalEUR: 1000,
  feesEUR: 0,
  fxRate: undefined,
};

const sell: Transaction = {
  isin: "US0378331005",
  product: "Apple Inc",
  date: "2023-06-15",
  type: "SELL",
  quantity: 5,
  pricePerUnit: 300,
  currency: "EUR",
  totalLocal: 1500,
  totalEUR: 1500,
  feesEUR: 0,
  fxRate: undefined,
};

describe("Regression: future-dated carryforward entry is not applied", () => {
  const report = new Calculator([buy, sell], [], {
    classification: STUB_CLASSIFICATION,
    carryForward: [{ year: 2026, amount: 1000 }],
  }).calculateGains("LIFO");

  it("taxYear === 2023", () => {
    expect(report.taxYear).toBe(2023);
  });

  it("bucketB.plusvalenze === 500", () => {
    expect(report.bucketB!.plusvalenze).toBe(500);
  });

  it("bucketB.carryForwardApplied === 0 (future-dated, not eligible)", () => {
    expect(report.bucketB!.carryForwardApplied).toBe(0);
  });

  it("bucketB.netResult === 500 (real gain unmodified)", () => {
    expect(report.bucketB!.netResult).toBe(500);
  });
});

describe("Regression: same-year carryforward entry is not applied", () => {
  const report = new Calculator([buy, sell], [], {
    classification: STUB_CLASSIFICATION,
    carryForward: [{ year: 2023, amount: 1000 }],
  }).calculateGains("LIFO");

  it("bucketB.carryForwardApplied === 0 (same-year, not eligible)", () => {
    expect(report.bucketB!.carryForwardApplied).toBe(0);
  });

  it("bucketB.netResult === 500 (real gain unmodified)", () => {
    expect(report.bucketB!.netResult).toBe(500);
  });
});
