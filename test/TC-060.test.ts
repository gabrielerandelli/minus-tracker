import { describe, it, expect } from "vitest";
import type { Transaction } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-060 (TC-B8): No classification + mixed ISINs → warnMixedAssets
 *
 * Calculator is created WITHOUT a classification map.
 * Transactions include IE00B4L5Y983 (IE prefix = ETF) AND US0378331005 (non-IE prefix).
 * The heuristic detects mixed assets and adds an AVVISO warning.
 *
 * Expected:
 *   report.warnings includes text starting with "AVVISO:"
 *   report.bucketA === undefined
 *   report.bucketB === undefined
 */

const transactions: Transaction[] = [
  {
    isin: "IE00B4L5Y983",
    product: "iShares MSCI World",
    date: "2024-01-10",
    type: "BUY",
    quantity: 10,
    pricePerUnit: 100,
    currency: "EUR",
    totalLocal: -1000,
    totalEUR: 1000,
    feesEUR: 0,
    fxRate: undefined,
  },
  {
    isin: "IE00B4L5Y983",
    product: "iShares MSCI World",
    date: "2024-06-10",
    type: "SELL",
    quantity: 10,
    pricePerUnit: 140,
    currency: "EUR",
    totalLocal: 1400,
    totalEUR: 1400,
    feesEUR: 0,
    fxRate: undefined,
  },
  {
    isin: "US0378331005",
    product: "Apple Inc",
    date: "2024-02-01",
    type: "BUY",
    quantity: 5,
    pricePerUnit: 100,
    currency: "EUR",
    totalLocal: -500,
    totalEUR: 500,
    feesEUR: 0,
    fxRate: undefined,
  },
  {
    isin: "US0378331005",
    product: "Apple Inc",
    date: "2024-07-01",
    type: "SELL",
    quantity: 5,
    pricePerUnit: 200,
    currency: "EUR",
    totalLocal: 1000,
    totalEUR: 1000,
    feesEUR: 0,
    fxRate: undefined,
  },
];

describe("TC-060 (TC-B8): No classification + mixed ISINs → warnMixedAssets", () => {
  // No options passed — no classification map
  const report = new Calculator(transactions).calculateGains("LIFO");

  it("warnings contains an AVVISO about mixed assets", () => {
    const hasAvviso = report.warnings.some((w) => w.startsWith("AVVISO:"));
    expect(hasAvviso).toBe(true);
  });

  it("bucketA is undefined (no classification)", () => {
    expect(report.bucketA).toBeUndefined();
  });

  it("bucketB is undefined (no classification)", () => {
    expect(report.bucketB).toBeUndefined();
  });
});
