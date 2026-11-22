import { describe, it, expect } from "vitest";
import { IBKRParser } from "../src/parser/ibkr.js";

/**
 * Category 20 — IBKR Parser: Income Rows (Dividends/Withholding Tax/Interest) (v0.11.0)
 * TC-149 through TC-158, from docs/test_plan/20-ibkr-parser-income-rows.md.
 */

const TRADES_HEADER =
  "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission,IBCommissionCurrency";
const TRADES_ROW =
  "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,5,95.00,-1.00,EUR";

describe('TC-149: Dividends row → IncomeRow with incomeType = "dividend", FX-converted grossAmount', () => {
  const csv = [
    "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND USD 0.24 PER SHARE,2.40",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");
  const snapshot = { USD: { "2024-03-15": 1.2 }, EUR: {} };

  it("parses one IncomeRow with FX conversion applied", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(1);
    const row = parser.incomeRows[0];
    expect(row.incomeType).toBe("dividend");
    expect(row.isin).toBe("US0378331005");
    expect(row.grossAmount).toBeCloseTo(2.0, 6);
    expect(row.fxRate).toBe(1.2);
    expect(parser.warnings).toEqual([]);
  });
});

describe("TC-150: Withholding Tax row matched to a Dividends row by (ISIN, Date, CurrencyPrimary) — single match", () => {
  const csv = [
    "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND USD 0.24 PER SHARE,2.40",
    "Withholding Tax,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Withholding Tax,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND - US TAX,-0.36",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");
  const snapshot = { USD: { "2024-03-15": 1.2 }, EUR: {} };

  it("joins withholding into the single income row", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(1);
    const row = parser.incomeRows[0];
    expect(row.grossAmount).toBeCloseTo(2.0, 6);
    expect(row.withholdingTax).toBeCloseTo(0.3, 6);
    expect(parser.warnings).toEqual([]);
  });
});

describe("TC-151: Multiple Dividends rows sharing a key — withholding allocated weighted by grossAmount share", () => {
  const csv = [
    "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Dividends,Data,EUR,IE00BK5BQT80,VWCE,20240315,VWCE DIVIDEND PART A,10.00",
    "Dividends,Data,EUR,IE00BK5BQT80,VWCE,20240315,VWCE DIVIDEND PART B,30.00",
    "Withholding Tax,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Withholding Tax,Data,EUR,IE00BK5BQT80,VWCE,20240315,VWCE DIVIDEND TAX,-4.00",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");
  const snapshot = { EUR: {} };

  it("allocates total withholding proportionally by grossAmount", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(2);
    const rowA = parser.incomeRows.find((r) => r.grossAmount === 10.0)!;
    const rowB = parser.incomeRows.find((r) => r.grossAmount === 30.0)!;
    expect(rowA.withholdingTax).toBeCloseTo(1.0, 6);
    expect(rowB.withholdingTax).toBeCloseTo(3.0, 6);
    expect(parser.warnings).toEqual([]);
  });
});

describe("TC-152: Unmatched Withholding Tax row → skip + warnUnmatchedWithholding", () => {
  const csv = [
    "Withholding Tax,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Withholding Tax,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND - US TAX,-0.36",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");
  const snapshot = { USD: { "2024-03-15": 1.2 }, EUR: {} };

  it("produces no IncomeRow and a section-relative orphan warning", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.incomeRows).toEqual([]);
    expect(parser.warnings).toContain(
      "Withholding Tax row 1: withholding tax with no matching income row — skipped",
    );
  });
});

describe("TC-153: Income row with no matching Withholding Tax row → withholdingTax = 0", () => {
  const csv = [
    "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Dividends,Data,EUR,IE00BK5BQT80,VWCE,20240315,VWCE DIVIDEND,10.00",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");
  const snapshot = { EUR: {} };

  it("defaults withholdingTax to 0 with no warning", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.incomeRows[0].withholdingTax).toBe(0);
    expect(parser.warnings).toEqual([]);
  });
});

describe('TC-154: Interest row — Type contains "Bond" (case-insensitive) and Amount > 0 → incomeType = "coupon"', () => {
  const csv = [
    "Interest,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount,Type",
    "Interest,Data,USD,US912828XXXX,,20240301,BOND INTEREST RECEIVED,12.50,Bond Interest Received",
    "Interest,Data,USD,US912828XXXX,,20240301,BOND INTEREST RECEIVED,12.50,bond interest received",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");
  const snapshot = { USD: { "2024-03-01": 1.1 }, EUR: {} };

  it("parses both qualifying rows as coupon income, case-insensitively", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(2);
    expect(parser.incomeRows[0].incomeType).toBe("coupon");
    expect(parser.incomeRows[0].grossAmount).toBeCloseTo(11.36, 2);
    expect(parser.incomeRows[1].incomeType).toBe("coupon");
  });
});

describe("TC-155: Interest row — non-Bond Type → excluded silently, no warning, no IncomeRow", () => {
  const csv = [
    "Interest,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount,Type",
    "Interest,Data,USD,,,20240301,USD CREDIT INTEREST,3.10,Credit Interest",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");

  it("produces no IncomeRow and no warning", () => {
    const parser = new IBKRParser();
    parser.parse(csv);
    expect(parser.incomeRows).toEqual([]);
    expect(parser.warnings).toEqual([]);
  });
});

describe('TC-156: Interest row — Type contains "Bond" but Amount is negative → excluded silently', () => {
  const csv = [
    "Interest,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount,Type",
    "Interest,Data,USD,US912828XXXX,,20240301,BOND INTEREST PAID,-8.75,Bond Interest Paid",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");

  it("produces no IncomeRow and no warning", () => {
    const parser = new IBKRParser();
    parser.parse(csv);
    expect(parser.incomeRows).toEqual([]);
    expect(parser.warnings).toEqual([]);
  });
});

describe("TC-157: Blank ISIN on a Dividends/qualifying-Interest row → skip + warnMissingIsin", () => {
  const csv = [
    "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Dividends,Data,EUR,,GENERIC,20240315,GENERIC DIVIDEND,10.00",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");
  const snapshot = { EUR: {} };

  it("excludes the row with a section-prefixed warning", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.incomeRows).toEqual([]);
    expect(parser.warnings).toContain(
      "Dividends row 1: missing ISIN — skipped",
    );
  });
});

describe("TC-158: Optional sections entirely absent → incomeRows = [], not an error", () => {
  const csv = [TRADES_HEADER, TRADES_ROW].join("\n");

  it("parses successfully with an empty incomeRows array", () => {
    const parser = new IBKRParser();
    expect(() => parser.parse(csv)).not.toThrow();
    expect(parser.incomeRows).toEqual([]);
  });
});

describe("QA regression (2026-10): Dividends row with a negative Amount (reversal/correction) → excluded silently, not reported as a second positive dividend", () => {
  const csv = [
    "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND USD 0.24 PER SHARE,50.00",
    "Dividends,Data,USD,US0378331005,AAPL,20240320,APPLE INC CASH DIVIDEND USD 0.24 PER SHARE - REVERSAL,-50.00",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");
  const snapshot = { USD: { "2024-03-15": 1.2, "2024-03-20": 1.2 }, EUR: {} };

  it("keeps only the original positive dividend; the negative reversal row is dropped, not converted into a second positive income entry", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(1);
    const row = parser.incomeRows[0];
    expect(row.incomeType).toBe("dividend");
    expect(row.date).toBe("2024-03-15");
    expect(row.grossAmount).toBeCloseTo(50.0 / 1.2, 6);
    expect(parser.warnings).toEqual([]);
  });

  it("a plain positive-amount Dividends row is completely unaffected by the fix", () => {
    const plainCsv = [
      "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
      "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND USD 0.24 PER SHARE,2.40",
      TRADES_HEADER,
      TRADES_ROW,
    ].join("\n");
    const parser = new IBKRParser({ USD: { "2024-03-15": 1.2 }, EUR: {} });
    parser.parse(plainCsv);
    expect(parser.incomeRows).toHaveLength(1);
    expect(parser.incomeRows[0].grossAmount).toBeCloseTo(2.0, 6);
  });
});

describe("QA regression (2026-10): a reversal row never rescales OTHER, unrelated Dividends rows sharing the same ISIN/currency (e.g. a quarterly dividend payer)", () => {
  // Four quarterly dividend payments, same ISIN/currency, only the first is reversed.
  // A netting-by-(ISIN,currency) fix was considered and rejected specifically because it
  // would spread the reversal's effect across Q2/Q3/Q4 too, corrupting amounts that were
  // never reversed. The exclusion-based fix must leave Q2/Q3/Q4 at their real, full amounts.
  const csv = [
    "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC Q1 DIVIDEND,50.00",
    "Dividends,Data,USD,US0378331005,AAPL,20240320,APPLE INC Q1 DIVIDEND - REVERSAL,-50.00",
    "Dividends,Data,USD,US0378331005,AAPL,20240615,APPLE INC Q2 DIVIDEND,50.00",
    "Dividends,Data,USD,US0378331005,AAPL,20240915,APPLE INC Q3 DIVIDEND,50.00",
    "Dividends,Data,USD,US0378331005,AAPL,20241215,APPLE INC Q4 DIVIDEND,50.00",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");
  const snapshot = {
    USD: {
      "2024-03-15": 1.2,
      "2024-03-20": 1.2,
      "2024-06-15": 1.2,
      "2024-09-15": 1.2,
      "2024-12-15": 1.2,
    },
    EUR: {},
  };

  it("reports Q1 (the reversed quarter) plus the three untouched quarters, each at their real full amount — never a rescaled fraction", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(4);
    for (const row of parser.incomeRows) {
      expect(row.grossAmount).toBeCloseTo(50.0 / 1.2, 6);
    }
    expect(parser.warnings).toEqual([]);
  });
});

describe("QA regression (2026-11): Withholding Tax charge fully offset by a same-key reversal → withholdingTax must not double, must net to ~0", () => {
  // Real IBKR exports report a genuine withholding charge as a NEGATIVE Amount
  // (cash outflow). A correction/reversal row undoing that exact charge shares
  // the SAME (ISIN, Date, CurrencyPrimary) key — that is the realistic case for
  // Withholding Tax corrections, unlike a Dividends reversal (which is commonly
  // posted on a later date and therefore does NOT share the Dividends row's own
  // join key — see the Dividends QA-regression blocks above, where the fix had
  // to be row exclusion for exactly that reason).
  //
  // Because Withholding Tax rows are already aggregated by this exact
  // (isin, date, currency) key before being joined to income rows
  // (`totalsByKey` in src/parser/ibkr.ts), a same-key reversal CAN be netted
  // safely here without any risk of smearing its effect onto other, unrelated
  // withholding rows — unlike the rejected (ISIN, currency)-only netting
  // considered (and rejected) for Dividends, this key already includes the
  // date, so it only ever nets a reversal against the exact charge it reverses.
  //
  // Expected value: the charge (-15.00) and its full reversal (+15.00) are the
  // same real-world cash-flow event undone — net cash withheld is 0, so no
  // foreign tax credit was ultimately retained by the broker. withholdingTax
  // must therefore be 0 (not 15, the original charge, and definitely not 30,
  // the pre-fix doubled value from summing two Math.abs()'d positive rows).
  const csv = [
    "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND,100.00",
    "Withholding Tax,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Withholding Tax,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND TAX,-15.00",
    "Withholding Tax,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND TAX - CORRECTION REVERSAL,15.00",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");
  const snapshot = { USD: { "2024-03-15": 1.2 }, EUR: {} };

  it("nets the charge and its full reversal to zero withholdingTax, not double the charge", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(1);
    const row = parser.incomeRows[0];
    expect(row.grossAmount).toBeCloseTo(100.0 / 1.2, 6);
    // Must not double (30 EUR-equivalent) nor even just report the original
    // charge (15 EUR-equivalent) — the reversal fully cancels it.
    expect(row.withholdingTax).toBeCloseTo(0, 6);
    expect(parser.warnings).toEqual([]);
  });

  it("a standalone withholding charge with no reversal is still reported at its real, non-doubled amount", () => {
    const soloCsv = [
      "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
      "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND,100.00",
      "Withholding Tax,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
      "Withholding Tax,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND TAX,-15.00",
      TRADES_HEADER,
      TRADES_ROW,
    ].join("\n");
    const parser = new IBKRParser(snapshot);
    parser.parse(soloCsv);
    expect(parser.incomeRows).toHaveLength(1);
    expect(parser.incomeRows[0].withholdingTax).toBeCloseTo(15.0 / 1.2, 6);
  });

  it("a PARTIAL reversal correctly reduces (not doubles or zeroes) the net withholding", () => {
    // Net charge is -15 + 5 = -10 USD → credit magnitude 10 USD → /1.2 EUR.
    // The pre-fix buggy behavior would have produced abs(-15)+abs(5) = 20 USD
    // (/1.2) instead — this is the scenario that specifically distinguishes a
    // correct netting fix from a fix that merely excludes any non-negative
    // row outright (which would wrongly keep the full original -15 charge
    // and ignore the partial correction entirely).
    const partialCsv = [
      "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
      "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND,100.00",
      "Withholding Tax,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
      "Withholding Tax,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND TAX,-15.00",
      "Withholding Tax,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND TAX - PARTIAL CORRECTION,5.00",
      TRADES_HEADER,
      TRADES_ROW,
    ].join("\n");
    const parser = new IBKRParser(snapshot);
    parser.parse(partialCsv);
    expect(parser.incomeRows).toHaveLength(1);
    expect(parser.incomeRows[0].withholdingTax).toBeCloseTo(10.0 / 1.2, 6);
  });
});

describe("QA regression (2026-11): a Withholding Tax reversal never rescales OTHER, unrelated withholding-bearing dividends (different date/ISIN)", () => {
  // Mirrors the Dividends "never rescales OTHER rows" regression test above.
  // Here the join key already includes the date, so a same-key reversal must
  // stay scoped to its own (isin, date, currency) and leave every other key's
  // withholding total completely untouched.
  const csv = [
    "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC Q1 DIVIDEND,100.00",
    "Dividends,Data,USD,US0378331005,AAPL,20240615,APPLE INC Q2 DIVIDEND,100.00",
    "Dividends,Data,EUR,IE00BK5BQT80,VWCE,20240315,VWCE DIVIDEND,50.00",
    "Withholding Tax,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Withholding Tax,Data,USD,US0378331005,AAPL,20240315,APPLE INC Q1 DIVIDEND TAX,-15.00",
    "Withholding Tax,Data,USD,US0378331005,AAPL,20240315,APPLE INC Q1 DIVIDEND TAX - CORRECTION REVERSAL,15.00",
    "Withholding Tax,Data,USD,US0378331005,AAPL,20240615,APPLE INC Q2 DIVIDEND TAX,-20.00",
    "Withholding Tax,Data,EUR,IE00BK5BQT80,VWCE,20240315,VWCE DIVIDEND TAX,-5.00",
    TRADES_HEADER,
    TRADES_ROW,
  ].join("\n");
  const snapshot = {
    USD: { "2024-03-15": 1.2, "2024-06-15": 1.2 },
    EUR: {},
  };

  it("nets only the Q1 (isin, date, currency) key to zero, leaving Q2 and the unrelated VWCE dividend at their real, un-rescaled withholding amounts", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(3);

    const q1 = parser.incomeRows.find(
      (r) => r.isin === "US0378331005" && r.date === "2024-03-15",
    )!;
    const q2 = parser.incomeRows.find(
      (r) => r.isin === "US0378331005" && r.date === "2024-06-15",
    )!;
    const vwce = parser.incomeRows.find((r) => r.isin === "IE00BK5BQT80")!;

    expect(q1.withholdingTax).toBeCloseTo(0, 6);
    expect(q2.withholdingTax).toBeCloseTo(20.0 / 1.2, 6);
    expect(vwce.withholdingTax).toBeCloseTo(5.0, 6);
    expect(parser.warnings).toEqual([]);
  });
});
