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
