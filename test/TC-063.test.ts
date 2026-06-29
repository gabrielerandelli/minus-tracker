import { describe, it, expect } from "vitest";
import type { Transaction, ClassificationMap } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-063: Same ETF ISIN, gain lot → Bucket A, loss lot → Bucket B
 *
 * BUY  10 IE00B4L5Y983 @ EUR 100/unit (2024-01-05) → lot at 100
 * BUY  10 IE00B4L5Y983 @ EUR  80/unit (2024-02-01) → lot at 80  (LIFO: this is "newer")
 * SELL 10 IE00B4L5Y983 @ EUR 120/unit (2024-06-01) → LIFO matches BUY at 80 → gain = (120-80)*10 = 400 → Bucket A
 * SELL 10 IE00B4L5Y983 @ EUR  60/unit (2024-09-01) → LIFO matches BUY at 100 → loss = (60-100)*10 = -400 → Bucket B
 *
 * (ETF has bucketGain="A", so gain → A; loss → B)
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
    date: "2024-01-05",
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
    date: "2024-02-01",
    type: "BUY",
    quantity: 10,
    pricePerUnit: 80,
    currency: "EUR",
    totalLocal: -800,
    totalEUR: 800,
    feesEUR: 0,
    fxRate: undefined,
  },
  {
    isin: "IE00B4L5Y983",
    product: "iShares MSCI World",
    date: "2024-06-01",
    type: "SELL",
    quantity: 10,
    pricePerUnit: 120,
    currency: "EUR",
    totalLocal: 1200,
    totalEUR: 1200,
    feesEUR: 0,
    fxRate: undefined,
  },
  {
    isin: "IE00B4L5Y983",
    product: "iShares MSCI World",
    date: "2024-09-01",
    type: "SELL",
    quantity: 10,
    pricePerUnit: 60,
    currency: "EUR",
    totalLocal: 600,
    totalEUR: 600,
    feesEUR: 0,
    fxRate: undefined,
  },
];

describe("TC-063: Same ETF ISIN — gain lot → Bucket A, loss lot → Bucket B", () => {
  const report = new Calculator(transactions, [], {
    classification: STUB_CLASSIFICATION,
  }).calculateGains("LIFO");

  it("two matched lots", () => {
    expect(report.lots).toHaveLength(2);
  });

  it("gain lot (buyPriceEUR=80) → bucket A", () => {
    const gainLot = report.lots.find((l) => l.gainLossEUR > 0);
    expect(gainLot).toBeDefined();
    expect(gainLot!.bucket).toBe("A");
    expect(gainLot!.gainLossEUR).toBe(400);
  });

  it("loss lot (buyPriceEUR=100) → bucket B", () => {
    const lossLot = report.lots.find((l) => l.gainLossEUR < 0);
    expect(lossLot).toBeDefined();
    expect(lossLot!.bucket).toBe("B");
    expect(lossLot!.gainLossEUR).toBe(-400);
  });

  it("bucketA.groups[0].plusvalenze === 400", () => {
    expect(report.bucketA!.groups[0].plusvalenze).toBe(400);
  });

  it("bucketB.minusvalenze === 400", () => {
    expect(report.bucketB!.minusvalenze).toBe(400);
  });
});
