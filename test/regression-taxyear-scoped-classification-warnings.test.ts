import { describe, it, expect } from "vitest";
import type { Transaction, ClassificationMap } from "../src/types.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * Regression: the "ISIN not found in classification map" warning must be
 * scoped to taxYear, not computed from the full unscoped matchedLots.
 *
 * Calculator.calculateGains scopes matchedLots down to `scopedLots` (only
 * lots whose sellDate falls in the report's taxYear) — every report field
 * is documented as being computed from that scoped set, not the full
 * matchedLots (see the comment above `scopedLots` in
 * src/calculator/index.ts). But the two-bucket classification routing loop
 * that assigns `lot.bucket` and collects `unclassifiedIsins` (the source of
 * this warning) iterated over the full, unscoped `matchedLots` instead.
 *
 * Bug: an ISIN that is NOT in the classification map but whose only BUY/SELL
 * activity falls entirely OUTSIDE the requested taxYear (so it never
 * appears in report.lots) still triggered the "not found in classification
 * map — assigned to Bucket B" warning on a report for a year it has nothing
 * to do with. This is misleading, user-facing, silently-wrong output: a
 * user generating e.g. a 2024 Dichiarazione would be warned about an
 * instrument entirely absent from the 2024 report.
 *
 * Two ISINs:
 *   - XX_UNCLASSIFIED: not in the classification map. Fully BUY'd and
 *     SELL'd in 2022 (both dates in 2022) — closed, never touches 2024.
 *   - IE00KNOWN: in the classification map (ETF, bucketGain "A",
 *     taxRate 0.26). BUY'd and SELL'd in 2024.
 *
 * A report requested for taxYear 2024 must NOT warn about XX_UNCLASSIFIED
 * (it has zero lots in 2024's scope), while a report requested for taxYear
 * 2022 (same transactions) MUST still warn about it (it IS in scope there).
 */

const STUB_CLASSIFICATION: ClassificationMap = {
  IE00KNOWN: {
    product: "Known ETF",
    assetClass: "ETF",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
    confirmedByUser: true,
    source: "openfigi",
  },
};

const unclassifiedBuy2022: Transaction = {
  isin: "XX_UNCLASSIFIED",
  product: "Unclassified Thing",
  date: "2022-01-10",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 50,
  currency: "EUR",
  totalLocal: -500,
  totalEUR: 500,
  feesEUR: 0,
  fxRate: undefined,
};

const unclassifiedSell2022: Transaction = {
  isin: "XX_UNCLASSIFIED",
  product: "Unclassified Thing",
  date: "2022-06-15",
  type: "SELL",
  quantity: 10,
  pricePerUnit: 60,
  currency: "EUR",
  totalLocal: 600,
  totalEUR: 600,
  feesEUR: 0,
  fxRate: undefined,
};

const knownBuy2024: Transaction = {
  isin: "IE00KNOWN",
  product: "Known ETF",
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

const knownSell2024: Transaction = {
  isin: "IE00KNOWN",
  product: "Known ETF",
  date: "2024-06-15",
  type: "SELL",
  quantity: 10,
  pricePerUnit: 150,
  currency: "EUR",
  totalLocal: 1500,
  totalEUR: 1500,
  feesEUR: 0,
  fxRate: undefined,
};

const transactions: Transaction[] = [
  unclassifiedBuy2022,
  unclassifiedSell2022,
  knownBuy2024,
  knownSell2024,
];

describe("Regression: classification warnings are scoped to taxYear", () => {
  const report2024 = new Calculator(transactions, [], {
    classification: STUB_CLASSIFICATION,
    taxYear: 2024,
  }).calculateGains("LIFO");

  it("2024 report does NOT warn about XX_UNCLASSIFIED (out of scope for 2024)", () => {
    const mentionsUnclassified = report2024.warnings.some((w) =>
      w.includes("XX_UNCLASSIFIED"),
    );
    expect(mentionsUnclassified).toBe(false);
  });

  it("2024 report.lots contains only the in-scope IE00KNOWN lot", () => {
    expect(report2024.lots).toHaveLength(1);
    expect(report2024.lots[0].isin).toBe("IE00KNOWN");
  });

  it("2024 report.bucketA reflects the in-scope IE00KNOWN gain (500 EUR @ 0.26)", () => {
    expect(report2024.bucketA).toBeDefined();
    expect(report2024.bucketA!.groups).toHaveLength(1);
    expect(report2024.bucketA!.groups[0].plusvalenze).toBe(500);
    expect(report2024.bucketA!.groups[0].taxRate).toBe(0.26);
    expect(report2024.bucketA!.totalImposta).toBe(130);
  });

  it("2024 report.bucketB is empty (no Bucket B lots in scope)", () => {
    expect(report2024.bucketB).toBeDefined();
    expect(report2024.bucketB!.plusvalenze).toBe(0);
    expect(report2024.bucketB!.minusvalenze).toBe(0);
    expect(report2024.bucketB!.netResult).toBe(0);
  });

  const report2022 = new Calculator(transactions, [], {
    classification: STUB_CLASSIFICATION,
    taxYear: 2022,
  }).calculateGains("LIFO");

  it("2022 report DOES warn about XX_UNCLASSIFIED (in scope for 2022)", () => {
    const mentionsUnclassified = report2022.warnings.some((w) =>
      w.includes("XX_UNCLASSIFIED"),
    );
    expect(mentionsUnclassified).toBe(true);
  });
});
