import { describe, it, expect } from "vitest";
import type { Transaction, ClassificationMap } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-062: Unclassified ISIN → Bucket B + exactly one warning per ISIN
 *
 * Transactions: BUY + SELL of "XX0000000999" (not in STUB_CLASSIFICATION)
 * Both lots should be assigned to Bucket B.
 * warnings should have exactly one entry mentioning "XX0000000999".
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
    isin: "XX0000000999",
    product: "Unknown Asset",
    date: "2024-01-10",
    type: "BUY",
    quantity: 10,
    pricePerUnit: 50,
    currency: "EUR",
    totalLocal: -500,
    totalEUR: 500,
    feesEUR: 0,
    fxRate: undefined,
  },
  {
    isin: "XX0000000999",
    product: "Unknown Asset",
    date: "2024-06-10",
    type: "SELL",
    quantity: 10,
    pricePerUnit: 70,
    currency: "EUR",
    totalLocal: 700,
    totalEUR: 700,
    feesEUR: 0,
    fxRate: undefined,
  },
];

describe("TC-062: Unclassified ISIN → Bucket B + one warning per ISIN", () => {
  const report = new Calculator(transactions, [], {
    classification: STUB_CLASSIFICATION,
  }).calculateGains("LIFO");

  it("lot.bucket === 'B' (unclassified)", () => {
    expect(report.lots[0].bucket).toBe("B");
  });

  it("exactly one warning mentioning XX0000000999", () => {
    const matching = report.warnings.filter((w) => w.includes("XX0000000999"));
    expect(matching).toHaveLength(1);
  });

  it("warning mentions Bucket B assignment", () => {
    const warning = report.warnings.find((w) => w.includes("XX0000000999"));
    expect(warning).toContain("Bucket B");
  });

  it("bucketB is defined and contains the gain", () => {
    expect(report.bucketB!.plusvalenze).toBe(200);
  });
});
