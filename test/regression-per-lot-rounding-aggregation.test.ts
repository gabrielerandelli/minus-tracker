import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { Calculator } from "../src/calculator/index.js";
import type { ClassificationMap } from "../src/types.js";

/**
 * Regression: Calculator.calculateGains() must sum each matched lot's RAW
 * (unrounded) gainLossEUR when computing the top-level plusvalenze/
 * minusvalenze aggregates (and the Bucket A/B routing/sums), rounding only
 * once at the very end — not sum the already-cent-rounded per-lot
 * `MatchedLot.gainLossEUR` values that live in `report.lots`.
 *
 * A DCA (dollar-cost-averaging) position built and closed across hundreds of
 * small lots, each with a genuine but sub-cent per-lot gain, is entirely
 * realistic on DEGIRO/IBKR (weekly/daily recurring-investment plans). Each
 * individual lot's gain can legitimately round to EUR 0.00 in isolation while
 * the TRUE total across all lots is clearly positive and taxable. Rounding
 * per-lot before summing silently drops that real gain to zero.
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

function buildDcaCsv(
  isin: string,
  n: number,
  buyPrice: number,
  sellPrice: number,
  buyYear: number,
  sellYear: number,
): string {
  const rows = [HEADER];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(buyYear, 0, 2));
    d.setUTCDate(d.getUTCDate() + i);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    rows.push(
      `${dd}-${mm}-${yyyy},09:00,DCA Corp,${isin},XXXX,XXXX,1,${buyPrice.toFixed(4)},-${buyPrice.toFixed(2)},EUR,-${buyPrice.toFixed(2)},EUR,1,0.00,EUR,-${buyPrice.toFixed(2)},EUR,buy-${i}`,
    );
  }
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(sellYear, 0, 2));
    d.setUTCDate(d.getUTCDate() + i);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    rows.push(
      `${dd}-${mm}-${yyyy},09:00,DCA Corp,${isin},XXXX,XXXX,-1,${sellPrice.toFixed(4)},${sellPrice.toFixed(4)},EUR,${sellPrice.toFixed(4)},EUR,1,0.00,EUR,${sellPrice.toFixed(4)},EUR,sell-${i}`,
    );
  }
  return rows.join("\n");
}

describe("regression: per-lot sub-cent gains must not vanish on aggregation", () => {
  it("300 BUY/SELL pairs with a 0.0049 EUR/share sub-cent gain sum to the true EUR 1.47 plusvalenze (not EUR 0.00)", () => {
    const isin = "US0000000777";
    const csv = buildDcaCsv(isin, 300, 100.0, 100.0049, 2023, 2024);
    const transactions = new DEGIROParser().parse(csv);
    const report = new Calculator(transactions, undefined, {
      taxYear: 2024,
    }).calculateGains("LIFO");

    expect(report.plusvalenze).toBeCloseTo(1.47, 2);
    expect(report.plusvalenze).not.toBe(0);
    expect(report.minusvalenze).toBe(0);
    expect(report.netResult).toBeCloseTo(1.47, 2);

    // Each individual matched lot still rounds to EUR 0.00 in isolation —
    // the public per-lot shape is unchanged, only the aggregate is fixed.
    for (const lot of report.lots) {
      expect(lot.gainLossEUR).toBe(0);
    }
  });

  it("works the same way under FIFO", () => {
    const isin = "US0000000778";
    const csv = buildDcaCsv(isin, 300, 100.0, 100.0049, 2023, 2024);
    const transactions = new DEGIROParser().parse(csv);
    const report = new Calculator(transactions, undefined, {
      taxYear: 2024,
    }).calculateGains("FIFO");

    expect(report.plusvalenze).toBeCloseTo(1.47, 2);
    expect(report.minusvalenze).toBe(0);
  });

  it("mixes sub-cent per-lot gains with genuine cent-level losses and still nets correctly", () => {
    // 150 lots with a tiny 0.0049 EUR/share gain (true total ~0.735) plus
    // 10 lots with a real, individually-material 2.50 EUR/share loss
    // (true total 25.00). Neither bucket should distort the other.
    const gainIsin = "US0000000779";
    const lossIsin = "US0000000780";
    const gainCsv = buildDcaCsv(gainIsin, 150, 100.0, 100.0049, 2023, 2024);
    const lossCsv = buildDcaCsv(lossIsin, 10, 100.0, 97.5, 2023, 2024);
    // Strip the duplicated header from the second block before concatenating.
    const combinedCsv = [
      gainCsv,
      ...lossCsv.split("\n").slice(1),
    ].join("\n");

    const transactions = new DEGIROParser().parse(combinedCsv);
    const report = new Calculator(transactions, undefined, {
      taxYear: 2024,
    }).calculateGains("LIFO");

    expect(report.plusvalenze).toBeCloseTo(0.74, 2); // 150 * 0.0049 = 0.735 -> 0.74
    expect(report.minusvalenze).toBeCloseTo(25.0, 2); // 10 * 2.50
    expect(report.netResult).toBeCloseTo(report.plusvalenze - report.minusvalenze, 2);
  });

  it("Bucket A + Bucket B plusvalenze still sum to the top-level plusvalenze under the classification map", () => {
    const bucketAIsin = "US0000000781"; // classified Bucket A (redditi di capitale)
    const bucketBIsin = "US0000000782"; // unclassified -> falls into Bucket B

    const bucketACsv = buildDcaCsv(bucketAIsin, 200, 100.0, 100.0049, 2023, 2024);
    const bucketBCsv = buildDcaCsv(bucketBIsin, 100, 100.0, 100.0049, 2023, 2024);
    const combinedCsv = [
      bucketACsv,
      ...bucketBCsv.split("\n").slice(1),
    ].join("\n");

    const classification: ClassificationMap = {
      [bucketAIsin]: {
        product: "DCA Corp",
        assetClass: "Stock",
        bucketGain: "A",
        bucketLoss: "B",
        taxRate: 0.26,
        whiteListed: false,
        confirmedByUser: true,
        source: "user",
      },
    };

    const transactions = new DEGIROParser().parse(combinedCsv);
    const report = new Calculator(transactions, undefined, {
      taxYear: 2024,
      classification,
    }).calculateGains("LIFO");

    // True total gain: 300 lots * 0.0049 = 1.47
    expect(report.plusvalenze).toBeCloseTo(1.47, 2);

    const bucketAPlusvalenze =
      report.bucketA?.groups.reduce((s, g) => s + g.plusvalenze, 0) ?? 0;
    const bucketBPlusvalenze = report.bucketB?.plusvalenze ?? 0;

    // Bucket A (200 lots * 0.0049 = 0.98) + Bucket B (100 lots * 0.0049 = 0.49)
    expect(bucketAPlusvalenze).toBeCloseTo(0.98, 2);
    expect(bucketBPlusvalenze).toBeCloseTo(0.49, 2);
    expect(bucketAPlusvalenze + bucketBPlusvalenze).toBeCloseTo(
      report.plusvalenze,
      2,
    );
  });
});
