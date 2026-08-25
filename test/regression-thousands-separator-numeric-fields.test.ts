import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { IBKRParser } from "../src/parser/ibkr.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * Regression: numeric CSV cells with thousands-separator grouping commas
 * (e.g. `"2,500"`), which is common real-world output from spreadsheet
 * software (Excel/Numbers/Google Sheets) re-saving a CSV with a
 * number-formatted column, were silently truncated by a bare `parseFloat`
 * call — `parseFloat("2,500")` === 2, not 2500 — with no error or warning.
 *
 * This corrupted BUY/SELL quantities and monetary amounts (Local value,
 * Transaction costs, Price, TradePrice, IBCommission, Amount) by 1000x+
 * without any signal, either throwing a confusing "No open lots"
 * CalculationError downstream or, worse, silently reporting wrong
 * quantities/prices when the corrupted lot happened to be fully consumed by
 * a single SELL.
 *
 * Fix: src/parser/numeric.ts's parseNumericField() validates the *entire*
 * trimmed cell against a plain-number or strict 3-digit-grouped-thousands
 * pattern before ever calling parseFloat, returning NaN (same failure
 * signal as a failing bare parseFloat) for anything else — including a
 * malformed/non-3-digit grouping like "1,2,3" or "2,50", which a naive
 * "strip every comma then parseFloat" approach would incorrectly accept as
 * a valid number instead of rejecting it.
 */

const DEGIRO_HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

describe("regression: DEGIRO quoted thousands-separator Quantity is parsed in full, not truncated", () => {
  // BUY "2,500" (quoted, comma thousands separator) shares, followed by an
  // entirely ordinary partial SELL of 500 shares out of that position.
  const BUY =
    '10-01-2024,09:05,Thousands Corp,US0000000003,XNAS,XNAS,"2,500",10.00,-25000.00,EUR,-25000.00,EUR,1,0.00,EUR,-25000.00,EUR,ord-1';
  const SELL =
    "15-01-2024,09:05,Thousands Corp,US0000000003,XNAS,XNAS,-500,12.00,6000.00,EUR,6000.00,EUR,1,0.00,EUR,6000.00,EUR,ord-2";

  const csv = [DEGIRO_HEADER, BUY, SELL].join("\n");

  it("parses the BUY row's Quantity as 2500, not 2", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const buyTx = transactions.find((t) => t.type === "BUY");
    expect(buyTx?.quantity).toBe(2500);
  });

  it("does not throw CalculationError on the subsequent 500-share partial SELL", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(() => new Calculator(transactions).calculateGains("LIFO")).not.toThrow();
  });

  it("produces exactly one matched lot of quantity 500 (not 2, not a crash), leaving 2,000 shares open", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const report = new Calculator(transactions).calculateGains("LIFO");
    expect(report.lots).toHaveLength(1);
    expect(report.lots[0].quantity).toBe(500);

    const buyTx = transactions.find((t) => t.type === "BUY")!;
    expect(buyTx.quantity - report.lots[0].quantity).toBe(2000);
  });

  it("same result under FIFO", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const report = new Calculator(transactions).calculateGains("FIFO");
    expect(report.lots).toHaveLength(1);
    expect(report.lots[0].quantity).toBe(500);
  });
});

describe("regression: DEGIRO quoted thousands-separator Local value / Transaction costs parsed in full", () => {
  const csv = [
    DEGIRO_HEADER,
    '10-01-2024,09:05,Big Value Corp,US0000000004,XNAS,XNAS,100,227.50,"-22,750.00",EUR,-22750.00,EUR,1,"1,250.00",EUR,-24000.00,EUR,ord-1',
  ].join("\n");

  it("parses Local value as -22750.00, not truncated to -22", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].totalLocal).toBeCloseTo(-22750.0, 6);
    expect(transactions[0].totalEUR).toBeCloseTo(22750.0, 6);
  });

  it("parses Transaction costs as 1250.00, not truncated to 1", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions[0].feesEUR).toBeCloseTo(1250.0, 6);
  });
});

describe("regression: DEGIRO negative thousands-separated Local value on a SELL row", () => {
  const csv = [
    DEGIRO_HEADER,
    '10-01-2024,09:05,Neg Value Corp,US0000000007,XNAS,XNAS,-100,227.50,"22,750.00",EUR,22750.00,EUR,1,0.00,EUR,22750.00,EUR,ord-1',
  ].join("\n");

  it("parses a negative-quantity SELL row's positive grouped Local value as 22750.00", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe("SELL");
    expect(transactions[0].totalEUR).toBeCloseTo(22750.0, 6);
  });
});

const IBKR_TRADES_HEADER =
  "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission,IBCommissionCurrency";

describe("regression: IBKR quoted thousands-separator Quantity/TradePrice/IBCommission parsed in full", () => {
  const csv = [
    IBKR_TRADES_HEADER,
    'Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,"2,500","1,850.00","-25,000.00",USD',
  ].join("\n");
  const snapshot = { USD: { "2024-01-02": 1.0 } };

  it("parses Quantity as 2500, not 2", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].quantity).toBe(2500);
  });

  it("parses TradePrice as 1850.00, not 1", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions[0].pricePerUnit).toBeCloseTo(1850.0, 6);
  });

  it("parses IBCommission as 25000.00 in feesEUR, not 25", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions[0].feesEUR).toBeCloseTo(25000.0, 6);
  });

  it("a subsequent ordinary 500-share partial SELL against that BUY does not throw and matches a 500-quantity lot", () => {
    const sellCsv = [
      IBKR_TRADES_HEADER,
      'Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,"2,500","1,850.00","-25,000.00",USD',
      "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240201,SELL,-500,1900.00,-2.00,USD",
    ].join("\n");
    const parser = new IBKRParser({ USD: { "2024-01-02": 1.0, "2024-02-01": 1.0 } });
    const transactions = parser.parse(sellCsv);
    expect(() => new Calculator(transactions).calculateGains("LIFO")).not.toThrow();
    const report = new Calculator(transactions).calculateGains("LIFO");
    expect(report.lots).toHaveLength(1);
    expect(report.lots[0].quantity).toBe(500);
  });
});

describe("regression guard: genuinely non-numeric or malformed-grouping fields are still rejected as NaN (fix must not weaken or loosen validation)", () => {
  it("DEGIRO: blank Quantity is still treated as blank / no crash, no silent nonzero quantity", () => {
    const csv = [
      DEGIRO_HEADER,
      "10-01-2024,09:05,Blank Qty Corp,US0000000005,XNAS,XNAS,,10.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,ord-1",
    ].join("\n");
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(
      parser.warningEntries.some((w) => w.code === "MISSING_ISIN_INCOME") ||
        parser.warningEntries.some((w) => w.code === "QUANTITY_ZERO"),
    ).toBe(true);
  });

  it('DEGIRO: garbage Quantity ("abc") is skipped with QUANTITY_ZERO, same as before the fix', () => {
    const csv = [
      DEGIRO_HEADER,
      "10-01-2024,09:05,Garbage Qty Corp,US0000000006,XNAS,XNAS,abc,10.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,ord-1",
    ].join("\n");
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(parser.warnings).toContain("Row 2: quantity is 0 — skipped");
  });

  it('DEGIRO: malformed comma grouping ("1,2,3") in Quantity is rejected as NaN, not silently read as 123', () => {
    const csv = [
      DEGIRO_HEADER,
      '10-01-2024,09:05,Malformed Corp,US0000000008,XNAS,XNAS,"1,2,3",10.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,ord-1',
    ].join("\n");
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(parser.warnings).toContain("Row 2: quantity is 0 — skipped");
  });

  it('IBKR: garbage Quantity ("abc") on a Trades row is skipped with the same QUANTITY_ZERO-style warning as before', () => {
    const csv = [
      IBKR_TRADES_HEADER,
      "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,abc,185.00,-2.00,USD",
    ].join("\n");
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(parser.warnings).toContain("Trades row 1: quantity is 0 — skipped");
  });

  it("IBKR: blank Quantity on a Trades row is skipped, same as before the fix", () => {
    const csv = [
      IBKR_TRADES_HEADER,
      "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,,185.00,-2.00,USD",
    ].join("\n");
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(parser.warnings).toContain("Trades row 1: quantity is 0 — skipped");
  });

  it('IBKR: malformed comma grouping ("1,2,3") in Quantity on a Trades row is rejected as NaN, not silently read as 123', () => {
    const csv = [
      IBKR_TRADES_HEADER,
      'Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,"1,2,3",185.00,-2.00,USD',
    ].join("\n");
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(parser.warnings).toContain("Trades row 1: quantity is 0 — skipped");
  });
});

