import { describe, it, expect } from "vitest";
import type { Transaction, ClassificationMap } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-059 (TC-B7): Expired carryforward entry is skipped
 *
 * US0378331005 (Stock, bucketGain=B): BUY 5@100, SELL 5@200 → plusvalenze = 500 EUR
 *
 * carryForward: [{year:2019, amount:300}]
 * taxYear: 2024 → gap = 2024 - 2019 = 5 > 4 → expired → skip
 *
 * carryForwardApplied = 0
 * netResult = 500
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

const buy: Transaction = {
  isin: "US0378331005",
  product: "Apple Inc",
  date: "2024-01-10",
  type: "BUY",
  quantity: 5,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -500,
  totalEUR: 500,
  feesEUR: 0,
  fxRate: undefined,
};

const sell: Transaction = {
  isin: "US0378331005",
  product: "Apple Inc",
  date: "2024-06-10",
  type: "SELL",
  quantity: 5,
  pricePerUnit: 200,
  currency: "EUR",
  totalLocal: 1000,
  totalEUR: 1000,
  feesEUR: 0,
  fxRate: undefined,
};

describe("TC-059 (TC-B7): Expired carryforward entry is skipped", () => {
  const report = new Calculator([buy, sell], [], {
    classification: STUB_CLASSIFICATION,
    carryForward: [{ year: 2019, amount: 300 }],
  }).calculateGains("LIFO");

  it("taxYear === 2024", () => {
    expect(report.taxYear).toBe(2024);
  });

  it("bucketB.plusvalenze === 500", () => {
    expect(report.bucketB!.plusvalenze).toBe(500);
  });

  it("bucketB.carryForwardApplied === 0 (expired)", () => {
    expect(report.bucketB!.carryForwardApplied).toBe(0);
  });

  it("bucketB.netResult === 500", () => {
    expect(report.bucketB!.netResult).toBe(500);
  });
});
