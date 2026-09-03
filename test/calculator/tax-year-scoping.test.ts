import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Calculator } from "../../src/calculator/index.js";
import { CalculationError } from "../../src/errors.js";
import type { ClassificationMap, Transaction } from "../../src/types.js";

/**
 * Task 50 — Calculator tax-year inference fix plus scoping logic (v0.11.2)
 *
 * Covers TC-171 through TC-176 and TC-179 from docs/test_plan.md /
 * docs/test_plan/23-multifile-taxyear.md. TC-177/178 (CLI `calc --year`) and
 * TC-180+ (multi-file CLI input) belong to a later CLI-level task.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ISIN = "US0378331005";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    isin: ISIN,
    product: "Apple Inc",
    date: "2024-01-01",
    type: "BUY",
    quantity: 1,
    pricePerUnit: 1,
    currency: "EUR",
    totalLocal: -1,
    totalEUR: 1,
    feesEUR: 0,
    ...overrides,
  };
}

describe("TC-171: options.taxYear filters MatchedLots while lot matching still runs on the full input", () => {
  // Two BUY lots opened in 2022 (LIFO: BUY2 is the most recently opened).
  // SELL1 (2023) consumes BUY2 first; SELL2 (2024) must then consume BUY1 —
  // which only happens if matching processed SELL1 too, even though SELL1's
  // result gets filtered out of the taxYear=2024 report. If the
  // implementation instead pre-filtered the input to only 2024 transactions
  // before matching, SELL2 would wrongly match BUY2 (still "open" in that
  // world) and report a buyDate of 2022-06-10 instead of 2022-01-10.
  const buy1 = tx({
    date: "2022-01-10",
    type: "BUY",
    quantity: 5,
    pricePerUnit: 100,
    totalLocal: -500,
    totalEUR: 500,
  });
  const buy2 = tx({
    date: "2022-06-10",
    type: "BUY",
    quantity: 5,
    pricePerUnit: 100,
    totalLocal: -500,
    totalEUR: 500,
  });
  const sell2023 = tx({
    date: "2023-03-01",
    type: "SELL",
    quantity: 5,
    pricePerUnit: 150,
    totalLocal: 750,
    totalEUR: 750,
  });
  const sell2024 = tx({
    date: "2024-03-01",
    type: "SELL",
    quantity: 5,
    pricePerUnit: 200,
    totalLocal: 1000,
    totalEUR: 1000,
  });

  const report = new Calculator([buy1, buy2, sell2023, sell2024], [], {
    taxYear: 2024,
  }).calculateGains("LIFO");

  it("does not throw and scopes the report to taxYear 2024", () => {
    expect(report.taxYear).toBe(2024);
  });

  it("includes only the 2024 SELL's matched lot in report.lots", () => {
    expect(report.lots).toHaveLength(1);
    expect(report.lots[0]!.sellDate).toBe("2024-03-01");
  });

  it("proves matching ran on the full input: the 2024 SELL consumed BUY1, not BUY2 — meaning the 2023 SELL was matched too, just filtered out of the report", () => {
    expect(report.lots[0]!.buyDate).toBe("2022-01-10");
  });

  it("scopes plusvalenze/minusvalenze to only the in-year matched lot", () => {
    // SELL2024: proceeds 1000 - cost 500 = 500 gain.
    expect(report.plusvalenze).toBe(500);
    expect(report.minusvalenze).toBe(0);
  });
});

describe("TC-172: SELLs span >1 year, taxYear omitted → CalculationError AMBIGUOUS_TAX_YEAR", () => {
  const buy = tx({
    date: "2022-01-10",
    type: "BUY",
    quantity: 10,
    pricePerUnit: 100,
    totalLocal: -1000,
    totalEUR: 1000,
  });
  const sell2023 = tx({
    date: "2023-03-01",
    type: "SELL",
    quantity: 5,
    pricePerUnit: 150,
    totalLocal: 750,
    totalEUR: 750,
  });
  const sell2024 = tx({
    date: "2024-03-01",
    type: "SELL",
    quantity: 5,
    pricePerUnit: 200,
    totalLocal: 1000,
    totalEUR: 1000,
  });

  it("throws CalculationError with code AMBIGUOUS_TAX_YEAR, ascending years, no isin/date", () => {
    expect.assertions(4);
    try {
      new Calculator([buy, sell2023, sell2024]).calculateGains("LIFO");
    } catch (err) {
      expect(err).toBeInstanceOf(CalculationError);
      const calcErr = err as CalculationError;
      expect(calcErr.code).toBe("AMBIGUOUS_TAX_YEAR");
      expect(calcErr.years).toEqual([2023, 2024]);
      expect(calcErr.isin).toBeUndefined();
    }
  });

  it("also throws for FIFO", () => {
    expect(() =>
      new Calculator([buy, sell2023, sell2024]).calculateGains("FIFO"),
    ).toThrow(CalculationError);
  });
});

describe("TC-173: SELLs all fall in one year, taxYear omitted → unchanged behavior (regression guard)", () => {
  // BUYs spread across three years; all SELLs happen in 2024 — the ordinary
  // shape of a multi-file merge (long buy history, this year's sells).
  const buy2021 = tx({
    date: "2021-01-10",
    type: "BUY",
    quantity: 5,
    pricePerUnit: 100,
    totalLocal: -500,
    totalEUR: 500,
  });
  const buy2022 = tx({
    date: "2022-01-10",
    type: "BUY",
    quantity: 5,
    pricePerUnit: 100,
    totalLocal: -500,
    totalEUR: 500,
  });
  const buy2023 = tx({
    date: "2023-01-10",
    type: "BUY",
    quantity: 5,
    pricePerUnit: 100,
    totalLocal: -500,
    totalEUR: 500,
  });
  const sell2024 = tx({
    date: "2024-01-10",
    type: "SELL",
    quantity: 15,
    pricePerUnit: 150,
    totalLocal: 2250,
    totalEUR: 2250,
  });

  const report = new Calculator(
    [buy2021, buy2022, buy2023, sell2024],
    [],
  ).calculateGains("LIFO");

  it("does not throw and infers taxYear 2024 from the sole SELL year", () => {
    expect(report.taxYear).toBe(2024);
  });

  it("includes all three matched-lot chunks from the 2024 SELL", () => {
    expect(report.lots).toHaveLength(3);
    expect(report.lots.every((l) => l.sellDate === "2024-01-10")).toBe(true);
    expect(report.plusvalenze).toBe(750); // 3 * (150-100) * 5
    expect(report.minusvalenze).toBe(0);
  });
});

describe("TC-174: explicit taxYear with zero matching SELLs → valid, empty report", () => {
  const classification: ClassificationMap = {
    [ISIN]: {
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

  const buy = tx({
    date: "2022-01-10",
    type: "BUY",
    quantity: 10,
    pricePerUnit: 100,
    totalLocal: -1000,
    totalEUR: 1000,
  });
  const sell2024 = tx({
    date: "2024-01-10",
    type: "SELL",
    quantity: 10,
    pricePerUnit: 150,
    totalLocal: 1500,
    totalEUR: 1500,
  });

  const report = new Calculator([buy, sell2024], [], {
    classification,
    taxYear: 2023,
  }).calculateGains("LIFO");

  it("does not throw", () => {
    expect(report).toBeDefined();
  });

  it("produces a valid, empty report scoped to taxYear 2023", () => {
    expect(report.taxYear).toBe(2023);
    expect(report.lots).toHaveLength(0);
    expect(report.plusvalenze).toBe(0);
    expect(report.minusvalenze).toBe(0);
  });

  it("bucketB is present but empty, bucketA is absent (no Bucket A lots)", () => {
    expect(report.bucketA).toBeUndefined();
    expect(report.bucketB).toEqual(
      expect.objectContaining({
        plusvalenze: 0,
        minusvalenze: 0,
        netResult: 0,
      }),
    );
  });
});

describe("TC-175: ratesUsed reflects the full input, unaffected by taxYear filtering", () => {
  const buy = tx({
    date: "2022-01-10",
    type: "BUY",
    quantity: 10,
    currency: "EUR",
    pricePerUnit: 100,
    totalLocal: -1000,
    totalEUR: 1000,
  });
  const sell2023 = tx({
    date: "2023-06-01",
    type: "SELL",
    quantity: 5,
    currency: "USD",
    pricePerUnit: 150,
    totalLocal: 750,
    totalEUR: 700,
    fxRate: 1.05,
  });
  const sell2024 = tx({
    date: "2024-06-01",
    type: "SELL",
    quantity: 5,
    currency: "USD",
    pricePerUnit: 160,
    totalLocal: 800,
    totalEUR: 720,
    fxRate: 1.1,
  });

  const report = new Calculator([buy, sell2023, sell2024], [], {
    taxYear: 2023,
  }).calculateGains("LIFO");

  it("scopes the report to the earlier year", () => {
    expect(report.taxYear).toBe(2023);
    expect(report.lots).toHaveLength(1);
    expect(report.lots[0]!.sellDate).toBe("2023-06-01");
  });

  it("includes ECB rates consulted for both years, not just the scoped one", () => {
    expect(report.ratesUsed["USD:2023-06-01"]).toBe(1.05);
    expect(report.ratesUsed["USD:2024-06-01"]).toBe(1.1);
  });
});

describe("TC-176: tax-year inference counts SELL dates only, not BUY dates", () => {
  it("(a) BUYs in 2022 and 2023, single SELL in 2024 → taxYear 2024, no ambiguity", () => {
    const buy2022 = tx({
      date: "2022-01-10",
      type: "BUY",
      quantity: 5,
      pricePerUnit: 100,
      totalLocal: -500,
      totalEUR: 500,
    });
    const buy2023 = tx({
      date: "2023-01-10",
      type: "BUY",
      quantity: 5,
      pricePerUnit: 100,
      totalLocal: -500,
      totalEUR: 500,
    });
    const sell2024 = tx({
      date: "2024-01-10",
      type: "SELL",
      quantity: 10,
      pricePerUnit: 150,
      totalLocal: 1500,
      totalEUR: 1500,
    });

    const report = new Calculator([buy2022, buy2023, sell2024]).calculateGains(
      "LIFO",
    );

    expect(report.taxYear).toBe(2024);
  });

  it("(b) no SELLs at all, BUYs spanning 2022-2023 → falls back to most-frequent year among all transaction dates", () => {
    const buy2022a = tx({
      date: "2022-01-10",
      type: "BUY",
      quantity: 5,
      pricePerUnit: 100,
      totalLocal: -500,
      totalEUR: 500,
    });
    const buy2022b = tx({
      date: "2022-06-10",
      type: "BUY",
      quantity: 5,
      pricePerUnit: 100,
      totalLocal: -500,
      totalEUR: 500,
    });
    const buy2023 = tx({
      date: "2023-01-10",
      type: "BUY",
      quantity: 5,
      pricePerUnit: 100,
      totalLocal: -500,
      totalEUR: 500,
    });

    const report = new Calculator([buy2022a, buy2022b, buy2023]).calculateGains(
      "LIFO",
    );

    // 2022 appears twice among all transaction dates, 2023 once — the
    // no-SELLs fallback picks the most frequent year overall.
    expect(report.taxYear).toBe(2022);
    expect(report.lots).toHaveLength(0);
  });
});

describe("TC-179: warnMultipleYears is no longer emitted anywhere (dead-code removal guard)", () => {
  it("the old multi-year warning push is not present in src/calculator/index.ts", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../src/calculator/index.ts"),
      "utf-8",
    );
    expect(source).not.toContain("warnMultipleYears");
    expect(source).not.toContain(
      "CSV contains transactions from multiple years",
    );
  });

  it("a multi-year-SELL input throws instead of returning a blended report with a warning", () => {
    const buy = tx({
      date: "2022-01-10",
      type: "BUY",
      quantity: 10,
      pricePerUnit: 100,
      totalLocal: -1000,
      totalEUR: 1000,
    });
    const sell2023 = tx({
      date: "2023-03-01",
      type: "SELL",
      quantity: 5,
      pricePerUnit: 150,
      totalLocal: 750,
      totalEUR: 750,
    });
    const sell2024 = tx({
      date: "2024-03-01",
      type: "SELL",
      quantity: 5,
      pricePerUnit: 200,
      totalLocal: 1000,
      totalEUR: 1000,
    });

    expect(() =>
      new Calculator([buy, sell2023, sell2024]).calculateGains("LIFO"),
    ).toThrow(CalculationError);
  });
});
