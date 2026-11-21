import { describe, it, expect } from "vitest";
import { IBKRParser } from "../src/parser/ibkr.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * Category 19 — IBKR Parser: Trades & Multi-Section Parsing (v0.11.0)
 * TC-135 through TC-148, from docs/test_plan/19-ibkr-parser-trades.md.
 */

const TRADES_HEADER =
  "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission,IBCommissionCurrency";

describe("TC-135: valid multi-section Flex Query CSV → correct Transaction[]", () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,10,185.00,-2.00,USD",
  ].join("\n");
  const snapshot = { USD: { "2024-01-02": 1.25 } };

  it("parses one transaction with correct amounts", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].isin).toBe("US0378331005");
    expect(transactions[0].type).toBe("BUY");
    expect(transactions[0].quantity).toBe(10);
    expect(transactions[0].totalEUR).toBeCloseTo(1480.0, 6);
    expect(transactions[0].feesEUR).toBeCloseTo(1.6, 6);
    expect(transactions[0].fxRate).toBe(1.25);
    expect(parser.warnings).toEqual([]);
  });
});

describe("TC-136: Trades section entirely absent → MISSING_SECTION", () => {
  const csv = [
    "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND USD 0.24 PER SHARE,2.40",
  ].join("\n");

  it("throws ParseError with code MISSING_SECTION and sectionName Trades", () => {
    const parser = new IBKRParser();
    expect(() => parser.parse(csv)).toThrowError();
    try {
      parser.parse(csv);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("MISSING_SECTION");
      expect(err.sectionName).toBe("Trades");
      expect(err.message).toBe("Missing required section: Trades");
    }
  });
});

describe("TC-137: Trades section present but missing a required column → MISSING_COLUMN", () => {
  // Header omits IBCommissionCurrency
  const csv = [
    "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission",
    "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,10,185.00,-2.00",
  ].join("\n");

  it("throws ParseError with code MISSING_COLUMN and columnName IBCommissionCurrency", () => {
    const parser = new IBKRParser();
    try {
      parser.parse(csv);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("MISSING_COLUMN");
      expect(err.columnName).toBe("IBCommissionCurrency");
      expect(err.message).toBe("Missing required column: IBCommissionCurrency");
    }
  });
});

describe("TC-138: blank ISIN on a Trades row → skip + section-prefixed warnMissingIsin", () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,5,95.00,-1.00,EUR",
    "Trades,Data,Order,STK,USD,AAPL,APPLE INC,,20240103,BUY,10,185.00,-2.00,USD",
  ].join("\n");

  it("skips the blank-ISIN row and returns 1 transaction", () => {
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
  });

  it("emits section-prefixed, section-relative warning", () => {
    const parser = new IBKRParser();
    parser.parse(csv);
    expect(parser.warnings).toContain("Trades row 2: missing ISIN — skipped");
  });
});

describe('TC-139: DataDiscriminator !== "Order" → row excluded silently', () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,5,95.00,-1.00,EUR",
    "Trades,Data,ClosePrice,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,5,96.00,0.00,EUR",
  ].join("\n");

  it("excludes the non-Order row with no warning", () => {
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(parser.warnings).toEqual([]);
  });
});

describe('TC-140: AssetCategory === "CASH" → row excluded silently', () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,5,95.00,-1.00,EUR",
    "Trades,Data,Order,CASH,USD,USD.EUR,USD.EUR,,20240102,SELL,1000,0.92,0.00,USD",
  ].join("\n");

  it("excludes the CASH row with no warning", () => {
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(parser.warnings).toEqual([]);
  });
});

describe("TC-141: EUR trade → fxRate undefined; non-EUR trade → fxRate via ECB lookup", () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,5,95.00,-1.00,EUR",
    "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,10,185.00,-2.00,USD",
  ].join("\n");
  const snapshot = { USD: { "2024-01-02": 1.25 } };

  it("EUR row bypasses ECB lookup", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions[0].fxRate).toBeUndefined();
    expect(transactions[0].totalEUR).toBeCloseTo(475.0, 6);
  });

  it("USD row uses trade-date ECB rate", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions[1].fxRate).toBe(1.25);
    expect(transactions[1].totalEUR).toBeCloseTo(1480.0, 6);
  });
});

describe("TC-142: no ECB rate for trade currency within lookback → skip + warnNoEcbRate", () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240214,BUY,10,185.00,-2.00,USD",
  ].join("\n");
  // No USD entry for 2024-02-14/13/12/11.
  const snapshot = { USD: {} };

  it("skips the row and emits a section-prefixed warning", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(parser.warnings).toContain(
      "Trades row 1: no ECB rate for USD on 2024-02-14 — skipped",
    );
  });
});

describe('TC-143: IBCommission blank or "0" → feesEUR = 0, no ECB lookup attempted', () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,5,95.00,,GBP",
    "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240103,BUY,5,95.00,0,GBP",
  ].join("\n");
  // No GBP rate available at all — must not be looked up.
  const snapshot = {};

  it("both rows parse with feesEUR = 0 and no warnings", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(2);
    expect(transactions[0].feesEUR).toBe(0);
    expect(transactions[1].feesEUR).toBe(0);
    expect(parser.warnings).toEqual([]);
  });
});

describe("TC-144: differing commission currency → independent ECB lookup, surfaced only via ratesUsed", () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,GBP,BP,BP PLC,GB0007980591,20240102,BUY,100,5.00,-3.00,USD",
  ].join("\n");
  const snapshot = {
    GBP: { "2024-01-02": 0.86 },
    USD: { "2024-01-02": 1.25 },
  };

  it("fxRate reflects only the GBP trade-currency rate", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions[0].fxRate).toBe(0.86);
  });

  it("feesEUR uses the independent USD commission rate", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions[0].feesEUR).toBeCloseTo(2.4, 6);
  });

  it("Calculator.calculateGains().ratesUsed contains the USD rate distinct from the GBP fxRate — end-to-end wiring through Calculator, not just the raw Transaction", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    // feesFxRate/feesCurrency must be set on the Transaction for Calculator
    // to pick them up.
    expect(transactions[0].feesFxRate).toBe(1.25);
    expect(transactions[0].feesCurrency).toBe("USD");

    const calculator = new Calculator(transactions, parser.warnings);
    const report = calculator.calculateGains("LIFO");
    expect(report.ratesUsed["USD:2024-01-02"]).toBe(1.25);
    expect(report.ratesUsed["GBP:2024-01-02"]).toBe(0.86);
    // Never exposed via Transaction.fxRate.
    expect(transactions[0].fxRate).not.toBe(1.25);
  });
});

describe("TC-145: IBCommissionCurrency has no ECB rate within lookback → skip row + warnNoEcbRate against commission currency", () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,GBP,BP,BP PLC,GB0007980591,20240102,BUY,100,5.00,-3.00,USD",
  ].join("\n");
  // GBP resolves fine; USD has no rate at all within lookback.
  const snapshot = {
    GBP: { "2024-01-02": 0.86 },
    USD: {},
  };

  it("skips the row entirely and warns against the commission currency", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(parser.warnings).toContain(
      "Trades row 1: no ECB rate for USD on 2024-01-02 — skipped",
    );
  });
});

describe("TC-146: blank Description → Transaction.product falls back to Symbol", () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,EUR,VWCE,,IE00BK5BQT80,20240102,BUY,5,95.00,-1.00,EUR",
  ].join("\n");

  it("uses Symbol as the display-name fallback", () => {
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions[0].product).toBe("VWCE");
  });
});

describe("TC-147: Trades Data rows with no Trades Header anywhere → MISSING_COLUMN", () => {
  const csv = [
    "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
    "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC CASH DIVIDEND USD 0.24 PER SHARE,2.40",
    "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,10,185.00,-2.00,USD",
  ].join("\n");

  it("throws ParseError with code MISSING_COLUMN", () => {
    const parser = new IBKRParser();
    try {
      parser.parse(csv);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("MISSING_COLUMN");
    }
  });
});

describe("zero-quantity Trades row is skipped like DEGIROParser's QUANTITY_ZERO (regression — QA-found bug)", () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,EUR,AAPL,APPLE INC,US0378331005,20240110,BUY,100,10.00,0,EUR",
    "Trades,Data,Order,STK,EUR,AAPL,APPLE INC,US0378331005,20240115,BUY,0,12.00,0,EUR",
    "Trades,Data,Order,STK,EUR,AAPL,APPLE INC,US0378331005,20240301,SELL,100,15.00,0,EUR",
  ].join("\n");

  it("skips the zero-quantity row, keeping only the 2 legitimate trades", () => {
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(2);
  });

  it("emits a QUANTITY_ZERO-style warning referencing the skipped row", () => {
    const parser = new IBKRParser();
    parser.parse(csv);
    expect(parser.warnings).toContain("Trades row 2: quantity is 0 — skipped");
  });

  it("yields a finite netResult matching the hand-computed gain of the 2 real trades", () => {
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    const calculator = new Calculator(transactions, parser.warnings);
    const report = calculator.calculateGains("LIFO");
    // Cost: 100 * 10.00 = 1000 EUR. Proceeds: 100 * 15.00 = 1500 EUR.
    expect(report.netResult).toBeCloseTo(500, 6);
    expect(Number.isFinite(report.netResult)).toBe(true);
  });
});

describe("TC-148: unrecognized section name ignored, known sections still parse", () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,5,95.00,-1.00,EUR",
    "Cash Report,Header,CurrencyPrimary,Description,Amount",
    "Cash Report,Data,EUR,Starting Cash,10000.00",
  ].join("\n");

  it("ignores the unknown section and returns only the Trades row", () => {
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(parser.warnings).toEqual([]);
  });
});

describe("regression: Buy/Sell value other than exact \"BUY\"/\"SELL\" (e.g. \"Buy\") is skipped with a warning, not silently miscast", () => {
  // Two rows for the same ISIN: a valid BUY of 20 shares, then a second row
  // that is ALSO meant to be a purchase (10 more shares) but has a malformed
  // Buy/Sell value ("Buy" instead of "BUY"). Before the fix, the unchecked
  // `as "BUY" | "SELL"` cast let this row's totalLocal sign default to BUY
  // (any value !== "SELL" was multiplied by -1) while nothing ever built a
  // Transaction to record it correctly — worse, if a stray "sell"-like typo
  // reached the Calculator's `tx.type === "BUY"` lot-matching check, it would
  // be treated as a SELL and fabricate a taxable gain against the wrong lot.
  // The correct behavior is: skip the malformed row entirely, with a clear
  // warning, and never let it become a Transaction at all.
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,20,150.00,-2.00,USD",
    "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240301,Buy,10,160.00,-2.00,USD",
  ].join("\n");
  const snapshot = {
    USD: { "2024-01-02": 1.1, "2024-03-01": 1.1 },
  };

  it("skips the malformed row and returns only the valid BUY as a Transaction", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe("BUY");
    expect(transactions[0].quantity).toBe(20);
  });

  it('emits a clear INVALID_BUY_SELL warning naming the offending value', () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(parser.warnings).toContain(
      'Trades row 2: invalid Buy/Sell value "Buy" (expected "BUY" or "SELL") — skipped',
    );
  });

  it("does not fabricate a capital gain: with only a real purchase on record, LIFO gains are zero", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    const calculator = new Calculator(transactions, parser.warnings);
    const report = calculator.calculateGains("LIFO");
    expect(report.netResult).toBe(0);
    expect(report.lots).toHaveLength(0);
  });
});

describe("regression: a well-formed \"BUY\"/\"SELL\" Buy/Sell value is unaffected by the validation", () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,10,95.00,-1.00,EUR",
    "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240301,SELL,10,100.00,-1.00,EUR",
  ].join("\n");

  it("parses both rows as Transactions with no warnings", () => {
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(2);
    expect(transactions[0].type).toBe("BUY");
    expect(transactions[1].type).toBe("SELL");
    expect(parser.warnings).toEqual([]);
  });
});

describe("regression: OPT Trades rows apply the optional Multiplier column to trade value", () => {
  // One call-option contract (multiplier 100), bought for a 2.50 EUR/share
  // premium plus 1 EUR commission, then sold two months later for a 4.00
  // EUR/share premium minus 1 EUR commission.
  // Real economics: buy cost = 1 * 100 * 2.50 + 1 = 251 EUR;
  //                 sell proceeds = 1 * 100 * 4.00 - 1 = 399 EUR;
  //                 gain = +148 EUR.
  const HEADER_WITH_MULTIPLIER =
    "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,Multiplier,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission,IBCommissionCurrency";
  const csv = [
    HEADER_WITH_MULTIPLIER,
    "Trades,Data,Order,OPT,EUR,SAP  260320C00220000,SAP SE 20MAR26 220.0 C,DE000OPT00019,100,20260110,BUY,1,2.50,-1.00,EUR",
    "Trades,Data,Order,OPT,EUR,SAP  260320C00220000,SAP SE 20MAR26 220.0 C,DE000OPT00019,100,20260210,SELL,1,4.00,-1.00,EUR",
  ].join("\n");

  it("multiplies quantity * multiplier * tradePrice into totalLocal/totalEUR, not just quantity * tradePrice", () => {
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(2);
    expect(transactions[0].totalEUR).toBeCloseTo(250, 6);
    expect(transactions[1].totalEUR).toBeCloseTo(400, 6);
    // pricePerUnit must stay the raw per-underlying-unit price from the row —
    // the multiplier is folded into totalLocal/totalEUR only.
    expect(transactions[0].pricePerUnit).toBe(2.5);
    expect(transactions[1].pricePerUnit).toBe(4.0);
  });

  it("produces the correct real-economics gain via Calculator.calculateGains", () => {
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    const calculator = new Calculator(transactions, parser.warnings);
    const report = calculator.calculateGains("LIFO");
    expect(report.lots).toHaveLength(1);
    expect(report.lots[0].gainLossEUR).toBeCloseTo(148, 6);
  });
});

describe("regression: Multiplier column absent, blank, non-numeric, zero, or negative defaults to 1", () => {
  it("Multiplier column entirely absent (existing header shape) behaves exactly as before", () => {
    const csv = [
      TRADES_HEADER,
      "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,10,95.00,-1.00,EUR",
    ].join("\n");
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].totalEUR).toBeCloseTo(950, 6);
    expect(parser.warnings).toEqual([]);
  });

  const HEADER_WITH_MULTIPLIER =
    "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,Multiplier,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission,IBCommissionCurrency";

  it.each([
    ["blank cell", ""],
    ["non-numeric garbage", "abc"],
    ["zero", "0"],
    ["negative", "-100"],
  ])("Multiplier %s falls back to a multiplier of 1", (_label, multiplierValue) => {
    const csv = [
      HEADER_WITH_MULTIPLIER,
      `Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,${multiplierValue},20240102,BUY,10,95.00,-1.00,EUR`,
    ].join("\n");
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].totalEUR).toBeCloseTo(950, 6);
  });

  it("Multiplier of 1 (plain stock row with the column present) is a no-op", () => {
    const csv = [
      HEADER_WITH_MULTIPLIER,
      "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,1,20240102,BUY,10,95.00,-1.00,EUR",
    ].join("\n");
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].totalEUR).toBeCloseTo(950, 6);
  });
});

/**
 * Regression — an ISIN shared across more than one distinct AssetCategory in
 * the Trades section (e.g. a STK row and an OPT row sharing the underlying's
 * ISIN, which real IBKR exports can produce when an option's own ISIN is
 * left blank and a pipeline backfills it with the underlying's). Calculator
 * matches lots purely by isin with no concept of AssetCategory, so without
 * this guard a 1-contract option lot would silently cross-match against the
 * stock's per-share lots as if 1 contract == 1 share. The parser must keep
 * only the dominant (most Data rows) AssetCategory per isin, drop the rest,
 * and warn — under both LIFO and FIFO.
 */
describe("regression: ISIN shared across AssetCategory values (MIXED_ASSET_CATEGORY_ISIN)", () => {
  const ASSET_HEADER =
    "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,Multiplier,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission,IBCommissionCurrency";

  describe("stock dominant (2 STK rows) vs option minority (1 OPT row) — the confirmed repro", () => {
    const csv = [
      ASSET_HEADER,
      "Trades,Data,Order,STK,CHF,NESN,NESTLE SA,CH0038863350,,20240301,BUY,10,100,-1,CHF",
      "Trades,Data,Order,OPT,CHF,NESN 20APR24 110 C,NESN APR24 110 CALL,CH0038863350,100,20240401,BUY,1,2,-1,CHF",
      "Trades,Data,Order,STK,CHF,NESN,NESTLE SA,CH0038863350,,20240905,SELL,10,120,-1,CHF",
    ].join("\n");

    it("excludes the minority OPT row from Transaction[] and warns", () => {
      const parser = new IBKRParser();
      const transactions = parser.parse(csv);
      expect(transactions).toHaveLength(2);
      expect(transactions.every((t) => t.quantity === 10)).toBe(true);
      expect(parser.warnings).toContain(
        "ISIN CH0038863350: mixed AssetCategory values in Trades (STK: 2 row(s), OPT: 1 row(s)) — kept STK as the dominant instrument, dropped OPT rows as the minority/likely-unrelated instrument",
      );
    });

    it.each(["LIFO", "FIFO"] as const)(
      "produces exactly one correct 10-share lot under %s — the option contributes nothing",
      (method) => {
        const parser = new IBKRParser();
        const transactions = parser.parse(csv);
        const calculator = new Calculator(transactions, parser.warnings);
        const report = calculator.calculateGains(method);

        expect(report.lots).toHaveLength(1);
        const lot = report.lots[0];
        expect(lot.isin).toBe("CH0038863350");
        expect(lot.quantity).toBe(10);
        expect(lot.buyDate).toBe("2024-03-01");
        expect(lot.sellDate).toBe("2024-09-05");
        expect(lot.gainLossEUR).toBeCloseTo(232.22, 2);
      },
    );
  });

  describe("option dominant (2 OPT rows) vs stock minority (1 STK row) — dominance in the other direction", () => {
    const csv = [
      ASSET_HEADER,
      "Trades,Data,Order,OPT,CHF,NESN 20APR24 110 C,NESN APR24 110 CALL,CH0038863350,100,20240301,BUY,1,2,-1,CHF",
      "Trades,Data,Order,OPT,CHF,NESN 20APR24 110 C,NESN APR24 110 CALL,CH0038863350,100,20240701,SELL,1,3,-1,CHF",
      "Trades,Data,Order,STK,CHF,NESN,NESTLE SA,CH0038863350,,20240401,BUY,5,50,-1,CHF",
    ].join("\n");

    it("keeps the OPT rows and excludes the minority STK row", () => {
      const parser = new IBKRParser();
      const transactions = parser.parse(csv);
      expect(transactions).toHaveLength(2);
      expect(transactions.every((t) => t.quantity === 1)).toBe(true);
      expect(parser.warnings).toContain(
        "ISIN CH0038863350: mixed AssetCategory values in Trades (OPT: 2 row(s), STK: 1 row(s)) — kept OPT as the dominant instrument, dropped STK rows as the minority/likely-unrelated instrument",
      );
    });
  });

  describe("tie (1 STK row vs 1 OPT row) — first AssetCategory encountered in the file wins", () => {
    const csv = [
      ASSET_HEADER,
      "Trades,Data,Order,STK,CHF,NESN,NESTLE SA,CH0038863350,,20240301,BUY,10,100,-1,CHF",
      "Trades,Data,Order,OPT,CHF,NESN 20APR24 110 C,NESN APR24 110 CALL,CH0038863350,100,20240401,BUY,1,2,-1,CHF",
    ].join("\n");

    it("keeps the first-encountered STK row and drops the later OPT row", () => {
      const parser = new IBKRParser();
      const transactions = parser.parse(csv);
      expect(transactions).toHaveLength(1);
      expect(transactions[0].quantity).toBe(10);
      expect(parser.warnings).toContain(
        "ISIN CH0038863350: mixed AssetCategory values in Trades (STK: 1 row(s), OPT: 1 row(s)) — kept STK as the dominant instrument, dropped OPT rows as the minority/likely-unrelated instrument (tie on row count — first AssetCategory encountered in the file was kept)",
      );
    });
  });

  it("same AssetCategory across all rows for an isin → no conflict, no warning", () => {
    const csv = [
      ASSET_HEADER,
      "Trades,Data,Order,STK,CHF,NESN,NESTLE SA,CH0038863350,,20240301,BUY,10,100,-1,CHF",
      "Trades,Data,Order,STK,CHF,NESN,NESTLE SA,CH0038863350,,20240905,SELL,10,120,-1,CHF",
    ].join("\n");
    const parser = new IBKRParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(2);
    expect(
      parser.warningEntries.some((w) => w.code === "MIXED_ASSET_CATEGORY_ISIN"),
    ).toBe(false);
  });
});
