import { describe, it, expect } from "vitest";
import type { Transaction, ClassificationMap } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-054 (TC-B2): ETF loss → Bucket B
 *
 * BUY  10 IE00B4L5Y983 @ EUR 140/unit (totalEUR=1400), feesEUR=0
 * SELL 10 IE00B4L5Y983 @ EUR 100/unit (totalEUR=1000), feesEUR=0
 * gainLossEUR = -400
 *
 * IE00B4L5Y983 has bucketGain="A" but this is a loss → lot.bucket = "B"
 * bucketA: undefined (no Bucket A lots)
 * bucketB.minusvalenze = 400
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
  isin: "IE00B4L5Y983",
  product: "iShares MSCI World",
  date: "2024-01-10",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 140,
  currency: "EUR",
  totalLocal: -1400,
  totalEUR: 1400,
  feesEUR: 0,
  fxRate: undefined,
};

const sell: Transaction = {
  isin: "IE00B4L5Y983",
  product: "iShares MSCI World",
  date: "2024-06-10",
  type: "SELL",
  quantity: 10,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: 1000,
  totalEUR: 1000,
  feesEUR: 0,
  fxRate: undefined,
};

describe("TC-054 (TC-B2): ETF loss → Bucket B", () => {
  const report = new Calculator([buy, sell], [], {
    classification: STUB_CLASSIFICATION,
  }).calculateGains("LIFO");

  it("lot.bucket === 'B'", () => {
    expect(report.lots[0].bucket).toBe("B");
  });

  it("bucketA is undefined (no Bucket A gains)", () => {
    expect(report.bucketA).toBeUndefined();
  });

  it("bucketB is defined", () => {
    expect(report.bucketB).toBeDefined();
  });

  it("bucketB.minusvalenze === 400", () => {
    expect(report.bucketB!.minusvalenze).toBe(400);
  });

  it("bucketB.plusvalenze === 0", () => {
    expect(report.bucketB!.plusvalenze).toBe(0);
  });

  it("report.minusvalenze === 400", () => {
    expect(report.minusvalenze).toBe(400);
  });
});
