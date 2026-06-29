import { describe, it, expect } from "vitest";
import type { Transaction, ClassificationMap } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-056 (TC-B4): BTP (GovtBondWL) gain → Bucket A at 12.5%
 *
 * BUY  10 IT0001086567 @ EUR 100/unit (totalEUR=1000), feesEUR=0
 * SELL 10 IT0001086567 @ EUR 120/unit (totalEUR=1200), feesEUR=0
 * gainLossEUR = 200
 *
 * IT0001086567 is GovtBondWL (bucketGain="A", taxRate=0.125)
 * bucketA.groups[0].taxRate = 0.125
 * bucketA.groups[0].imposta = 200 * 0.125 = 25.00
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
  isin: "IT0001086567",
  product: "BTP 2.5% 2030",
  date: "2024-01-10",
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
  isin: "IT0001086567",
  product: "BTP 2.5% 2030",
  date: "2024-06-10",
  type: "SELL",
  quantity: 10,
  pricePerUnit: 120,
  currency: "EUR",
  totalLocal: 1200,
  totalEUR: 1200,
  feesEUR: 0,
  fxRate: undefined,
};

describe("TC-056 (TC-B4): BTP (GovtBondWL) gain → Bucket A at 12.5%", () => {
  const report = new Calculator([buy, sell], [], {
    classification: STUB_CLASSIFICATION,
  }).calculateGains("LIFO");

  it("lot.bucket === 'A'", () => {
    expect(report.lots[0].bucket).toBe("A");
  });

  it("bucketA is defined", () => {
    expect(report.bucketA).toBeDefined();
  });

  it("bucketA.groups[0].taxRate === 0.125", () => {
    expect(report.bucketA!.groups[0].taxRate).toBe(0.125);
  });

  it("bucketA.groups[0].plusvalenze === 200", () => {
    expect(report.bucketA!.groups[0].plusvalenze).toBe(200);
  });

  it("bucketA.groups[0].imposta === 25.00", () => {
    expect(report.bucketA!.groups[0].imposta).toBe(25.0);
  });

  it("bucketA.totalImposta === 25.00", () => {
    expect(report.bucketA!.totalImposta).toBe(25.0);
  });
});
