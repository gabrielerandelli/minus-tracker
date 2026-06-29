import { describe, it, expect } from "vitest";
import type { Transaction, ClassificationMap } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-055 (TC-B3): ETF gain + Stock gain
 *
 * IE00B4L5Y983 (ETF, bucketGain=A): BUY 10@100, SELL 10@140 → gain = 400 EUR → Bucket A
 * US0378331005 (Stock, bucketGain=B): BUY 2@100, SELL 2@233 → gain = 266 EUR → Bucket B
 *
 * bucketA.plusvalenze = 400
 * bucketB.plusvalenze = 266
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
    quantity: 2,
    pricePerUnit: 100,
    currency: "EUR",
    totalLocal: -200,
    totalEUR: 200,
    feesEUR: 0,
    fxRate: undefined,
  },
  {
    isin: "US0378331005",
    product: "Apple Inc",
    date: "2024-07-01",
    type: "SELL",
    quantity: 2,
    pricePerUnit: 233,
    currency: "EUR",
    totalLocal: 466,
    totalEUR: 466,
    feesEUR: 0,
    fxRate: undefined,
  },
];

describe("TC-055 (TC-B3): ETF gain + Stock gain", () => {
  const report = new Calculator(transactions, [], {
    classification: STUB_CLASSIFICATION,
  }).calculateGains("LIFO");

  it("ETF lot → Bucket A", () => {
    const etfLot = report.lots.find((l) => l.isin === "IE00B4L5Y983");
    expect(etfLot?.bucket).toBe("A");
  });

  it("Stock lot → Bucket B", () => {
    const stockLot = report.lots.find((l) => l.isin === "US0378331005");
    expect(stockLot?.bucket).toBe("B");
  });

  it("bucketA is defined", () => {
    expect(report.bucketA).toBeDefined();
  });

  it("bucketA.groups[0].plusvalenze === 400", () => {
    expect(report.bucketA!.groups[0].plusvalenze).toBe(400);
  });

  it("bucketB.plusvalenze === 266", () => {
    expect(report.bucketB!.plusvalenze).toBe(266);
  });

  it("report.plusvalenze === 666", () => {
    expect(report.plusvalenze).toBe(666);
  });
});
