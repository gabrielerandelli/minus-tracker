import { describe, it, expect } from "vitest";
import type { Transaction, ClassificationMap } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * TC-122: bucketB.carryForwardEntriesRemaining — per-entry unused balance
 *
 * Reproduces the exact AC-07 QA-simulation scenario: a Bucket B gain of 181
 * EUR (taxYear 2024) against carryForward entries [{year:2020, amount:1000},
 * {year:2019, amount:500}]. The 2020 entry is 4 years back (taxYear - 2020 =
 * 4, within the <= 4 cutoff) and gets partially consumed (181 of its 1000);
 * the 2019 entry is 5 years back (expired, never eligible) and must NOT
 * appear in carryForwardEntriesRemaining at all — it's expired, not
 * "remaining."
 *
 * Expected:
 *   carryForwardApplied = 181
 *   carryForwardEntriesRemaining = [{ annoOrigine: 2020, importo: 819 }]
 *     (2019 entry excluded — expired)
 */

const STOCK_ISIN = "US0378331005";

const CLASSIFICATION: ClassificationMap = {
  [STOCK_ISIN]: {
    product: "Apple Inc",
    assetClass: "Stock",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
    confirmedByUser: true,
    source: "user",
  },
};

const transactions: Transaction[] = [
  {
    isin: STOCK_ISIN,
    product: "Apple Inc",
    date: "2024-01-02",
    type: "BUY",
    quantity: 10,
    pricePerUnit: 150,
    currency: "USD",
    totalLocal: 1500,
    totalEUR: 1365,
    feesEUR: 2,
  },
  {
    isin: STOCK_ISIN,
    product: "Apple Inc",
    date: "2024-06-05",
    type: "SELL",
    quantity: 10,
    pricePerUnit: 170,
    currency: "USD",
    totalLocal: 1700,
    totalEUR: 1550,
    feesEUR: 2,
  },
];

describe("TC-122: carryForwardEntriesRemaining reports per-entry unused balance", () => {
  const report = new Calculator(transactions, [], {
    classification: CLASSIFICATION,
    carryForward: [
      { year: 2020, amount: 1000 },
      { year: 2019, amount: 500 },
    ],
  }).calculateGains("LIFO");

  it("infers taxYear 2024", () => {
    expect(report.taxYear).toBe(2024);
  });

  it("applies only the 2020 entry, up to the 181 EUR gain", () => {
    expect(report.bucketB?.carryForwardApplied).toBe(181);
  });

  it("reports the 2020 entry's unused 819 EUR balance as remaining", () => {
    expect(report.bucketB?.carryForwardEntriesRemaining).toEqual([
      { annoOrigine: 2020, importo: 819 },
    ]);
  });

  it("excludes the expired 2019 entry entirely (5 years back, never eligible)", () => {
    const has2019 = report.bucketB?.carryForwardEntriesRemaining.some(
      (e) => e.annoOrigine === 2019,
    );
    expect(has2019).toBe(false);
  });
});
