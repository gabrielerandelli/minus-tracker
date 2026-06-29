import { describe, it, expect } from "vitest";
import type { Transaction, ClassificationMap } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-058 (TC-B6): Carryforward consumed oldest-first
 *
 * US0378331005 (Stock, bucketGain=B): BUY 20@100, SELL 20@200 → plusvalenze = 2000 EUR
 * XS0000000001 (CorpBond, bucketGain=B): BUY 5@100, SELL 5@0 → minusvalenze = 500 EUR
 *
 * carryForward: [{year:2022, amount:1000}, {year:2023, amount:500}]
 * taxYear: 2024
 * bucketB.plusvalenze = 2000
 * bucketB.minusvalenze = 500
 * net before carryforward = 2000 - 500 = 1500
 * carryForwardApplied = 1000 (2022) + 500 (2023) = 1500
 * netResult = 1500 - 1500 = 0
 * carryForwardRemaining = 0
 */

const STUB_CLASSIFICATION: ClassificationMap = {
  IE00B4L5Y983: {
    product: "iShares MSCI World",
    assetClass: "ETF",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
    confirmedByUser: true,
    source: "openfigi",
  },
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
  IT0001086567: {
    product: "BTP 2.5% 2030",
    assetClass: "GovtBondWL",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.125,
    whiteListed: true,
    confirmedByUser: true,
    source: "openfigi",
  },
  BR0000000001: {
    product: "Brazil 5% 2032",
    assetClass: "GovtBondOther",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: false,
    confirmedByUser: true,
    source: "openfigi",
  },
  XS0000000001: {
    product: "Corp Bond ABC",
    assetClass: "CorpBond",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
    confirmedByUser: true,
    source: "openfigi",
  },
};

const transactions: Transaction[] = [
  {
    isin: "US0378331005",
    product: "Apple Inc",
    date: "2024-01-10",
    type: "BUY",
    quantity: 20,
    pricePerUnit: 100,
    currency: "EUR",
    totalLocal: -2000,
    totalEUR: 2000,
    feesEUR: 0,
    fxRate: undefined,
  },
  {
    isin: "US0378331005",
    product: "Apple Inc",
    date: "2024-06-10",
    type: "SELL",
    quantity: 20,
    pricePerUnit: 200,
    currency: "EUR",
    totalLocal: 4000,
    totalEUR: 4000,
    feesEUR: 0,
    fxRate: undefined,
  },
  {
    isin: "XS0000000001",
    product: "Corp Bond ABC",
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
    isin: "XS0000000001",
    product: "Corp Bond ABC",
    date: "2024-07-01",
    type: "SELL",
    quantity: 5,
    pricePerUnit: 0,
    currency: "EUR",
    totalLocal: 0,
    totalEUR: 0,
    feesEUR: 0,
    fxRate: undefined,
  },
];

describe("TC-058 (TC-B6): Carryforward consumed oldest-first", () => {
  const report = new Calculator(transactions, [], {
    classification: STUB_CLASSIFICATION,
    carryForward: [
      { year: 2022, amount: 1000 },
      { year: 2023, amount: 500 },
    ],
  }).calculateGains("LIFO");

  it("bucketB.plusvalenze === 2000", () => {
    expect(report.bucketB!.plusvalenze).toBe(2000);
  });

  it("bucketB.minusvalenze === 500", () => {
    expect(report.bucketB!.minusvalenze).toBe(500);
  });

  it("bucketB.carryForwardApplied === 1500", () => {
    expect(report.bucketB!.carryForwardApplied).toBe(1500);
  });

  it("bucketB.netResult === 0", () => {
    expect(report.bucketB!.netResult).toBe(0);
  });

  it("bucketB.carryForwardRemaining === 0", () => {
    expect(report.bucketB!.carryForwardRemaining).toBe(0);
  });
});
