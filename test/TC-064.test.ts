import { describe, it, expect } from "vitest";
import type { Transaction, ClassificationMap } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-064: Bucket sum invariant
 *
 * The sum of plusvalenze across all buckets must equal report.plusvalenze.
 * Scenario: ETF gain (→ Bucket A) + Stock gain (→ Bucket B) + Stock loss (→ Bucket B)
 *
 * IE00B4L5Y983: BUY 10@100, SELL 10@140 → gain = 400 → Bucket A
 * US0378331005: BUY 5@100, SELL 5@160 → gain = 300 → Bucket B
 * XS0000000001: BUY 3@100, SELL 3@50 → loss = 150 → Bucket B
 *
 * (bucketA?.groups.reduce(sum of plusvalenze) ?? 0) + bucketB.plusvalenze ≈ report.plusvalenze
 * 400 + 300 = 700 = report.plusvalenze
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
  // ETF: gain → Bucket A
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
  // Stock: gain → Bucket B
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
    pricePerUnit: 160,
    currency: "EUR",
    totalLocal: 800,
    totalEUR: 800,
    feesEUR: 0,
    fxRate: undefined,
  },
  // Corp Bond: loss → Bucket B
  {
    isin: "XS0000000001",
    product: "Corp Bond ABC",
    date: "2024-03-01",
    type: "BUY",
    quantity: 3,
    pricePerUnit: 100,
    currency: "EUR",
    totalLocal: -300,
    totalEUR: 300,
    feesEUR: 0,
    fxRate: undefined,
  },
  {
    isin: "XS0000000001",
    product: "Corp Bond ABC",
    date: "2024-08-01",
    type: "SELL",
    quantity: 3,
    pricePerUnit: 50,
    currency: "EUR",
    totalLocal: 150,
    totalEUR: 150,
    feesEUR: 0,
    fxRate: undefined,
  },
];

describe("TC-064: Bucket sum invariant", () => {
  const report = new Calculator(transactions, [], {
    classification: STUB_CLASSIFICATION,
  }).calculateGains("LIFO");

  it("report.plusvalenze equals sum of bucket plusvalenze", () => {
    const bucketAPlusvalenze =
      report.bucketA?.groups.reduce((s, g) => s + g.plusvalenze, 0) ?? 0;
    const bucketBPlusvalenze = report.bucketB!.plusvalenze;
    expect(
      Math.abs(bucketAPlusvalenze + bucketBPlusvalenze - report.plusvalenze),
    ).toBeLessThan(0.01);
  });

  it("bucketA plusvalenze === 400 (ETF gain)", () => {
    const bucketAPlusvalenze =
      report.bucketA?.groups.reduce((s, g) => s + g.plusvalenze, 0) ?? 0;
    expect(bucketAPlusvalenze).toBe(400);
  });

  it("bucketB.plusvalenze === 300 (Stock gain)", () => {
    expect(report.bucketB!.plusvalenze).toBe(300);
  });

  it("bucketB.minusvalenze === 150 (Corp Bond loss)", () => {
    expect(report.bucketB!.minusvalenze).toBe(150);
  });

  it("report.plusvalenze === 700", () => {
    expect(report.plusvalenze).toBe(700);
  });

  it("report.minusvalenze === 150", () => {
    expect(report.minusvalenze).toBe(150);
  });
});
