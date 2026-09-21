import { describe, it, expect } from "vitest";
import { IBKRParser } from "../src/parser/ibkr.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * Regression: IBKRParser.parseTradesRow's Commission-FX block (which
 * "mirrors" DEGIROParser's fee-FX block — see the code comment there)
 * treated a BLANK IBCommissionCurrency cell identically to a
 * populated-but-unrecognized currency code. Both fell through to the same
 * lookupRate(commissionCurrency, ...) call, which returns null for an empty
 * string, and parseTradesRow returned undefined — discarding the whole
 * trade row, not just the commission. A valid BUY leg with a non-zero
 * IBCommission and a blank IBCommissionCurrency cell (every other required
 * column populated) therefore vanished from the parsed Transaction[], and a
 * round-trip trade built from such rows made Calculator.calculateGains()
 * throw CalculationError NO_OPEN_LOTS on the surviving SELL.
 *
 * Fix: a blank IBCommissionCurrency cell (as opposed to a genuinely
 * unrecognized, non-blank one) is no longer treated as unresolvable.
 * IBKRParser now assumes the commission is denominated in the trade's own
 * already-resolved CurrencyPrimary and keeps the row, pushing a distinct
 * FEE_CURRENCY_ASSUMED warning (section-prefixed, like all IBKR warnings)
 * so a user can double check their Activity Flex Query export.
 */

const TRADES_HEADER =
  "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission,IBCommissionCurrency";

const USD_RATE_2024_01_02 = 1.1;
const USD_RATE_2024_06_05 = 1.08;

describe("regression: IBKR blank IBCommissionCurrency cell no longer drops the whole trade row", () => {
  // BUY: IBCommission is non-zero but IBCommissionCurrency is left blank
  // (trailing comma, empty last field). Every other required column is
  // present and populated.
  const BUY =
    "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,10,100.00,-1.00,";
  // SELL: IBCommissionCurrency explicitly populated (USD, matching the
  // trade's own CurrencyPrimary) -- closes the round trip, unaffected by
  // the fix.
  const SELL =
    "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240605,SELL,10,120.00,-1.00,USD";

  const csv = [TRADES_HEADER, BUY, SELL].join("\n");
  const snapshot = {
    USD: {
      "2024-01-02": USD_RATE_2024_01_02,
      "2024-06-05": USD_RATE_2024_06_05,
    },
  };

  it("keeps both the BUY and SELL legs instead of dropping the blank-commission-currency BUY", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(2);
    expect(transactions.filter((t) => t.type === "BUY")).toHaveLength(1);
    expect(transactions.filter((t) => t.type === "SELL")).toHaveLength(1);
  });

  it("prices the blank-currency commission by assuming the trade's own (USD) currency, not zero", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    const buyTx = transactions.find((t) => t.type === "BUY")!;
    const expectedFeeEUR = 1.0 / USD_RATE_2024_01_02;
    expect(buyTx.feesEUR).toBeCloseTo(expectedFeeEUR, 6);
    expect(buyTx.feesEUR).not.toBe(0);
    // Assumed currency equals the trade's own currency, so — mirroring the
    // existing "commission currency equals trade currency" behavior —
    // feesFxRate/feesCurrency stay unstamped.
    expect(buyTx.feesFxRate).toBeUndefined();
    expect(buyTx.feesCurrency).toBeUndefined();
  });

  it("emits a section-prefixed FEE_CURRENCY_ASSUMED warning naming the assumed currency", () => {
    const parser = new IBKRParser(snapshot);
    parser.parse(csv);
    expect(
      parser.warningEntries.some(
        (w) =>
          w.code === "FEE_CURRENCY_ASSUMED" &&
          w.currency === "USD" &&
          w.section === "Trades",
      ),
    ).toBe(true);
    expect(
      parser.warnings.some(
        (w) => w.startsWith("Trades row 1:") && w.includes("assumed USD"),
      ),
    ).toBe(true);
  });

  it("no longer throws CalculationError NO_OPEN_LOTS — Calculator matches the round trip cleanly", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(() =>
      new Calculator(transactions).calculateGains("FIFO"),
    ).not.toThrow();
  });

  it("computes a numerically sane gain for the round trip", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    const report = new Calculator(transactions).calculateGains("FIFO");

    expect(report.lots).toHaveLength(1);
    const lot = report.lots[0];

    const buyFeeEUR = 1.0 / USD_RATE_2024_01_02;
    const sellFeeEUR = 1.0 / USD_RATE_2024_06_05;
    const buyCostEUR = 1000.0 / USD_RATE_2024_01_02 + buyFeeEUR;
    const sellProceedsEUR = 1200.0 / USD_RATE_2024_06_05 - sellFeeEUR;
    const expectedGain = sellProceedsEUR - buyCostEUR;

    expect(lot.buyCostEUR).toBeCloseTo(buyCostEUR, 2);
    expect(lot.sellProceedsEUR).toBeCloseTo(sellProceedsEUR, 2);
    expect(lot.gainLossEUR).toBeCloseTo(expectedGain, 2);
    expect(report.netResult).toBeCloseTo(expectedGain, 2);
  });
});

describe("regression guard: a genuinely unsupported (non-blank) commission currency still drops the row unchanged", () => {
  const csv = [
    TRADES_HEADER,
    "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,10,100.00,-1.00,JPY",
  ].join("\n");
  const snapshot = { USD: { "2024-01-02": 1.1 } };

  it("still drops the row and pushes NO_ECB_RATE for JPY, not FEE_CURRENCY_ASSUMED", () => {
    const parser = new IBKRParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(
      parser.warningEntries.some(
        (w) => w.code === "NO_ECB_RATE" && w.currency === "JPY",
      ),
    ).toBe(true);
    expect(
      parser.warningEntries.some((w) => w.code === "FEE_CURRENCY_ASSUMED"),
    ).toBe(false);
  });
});
