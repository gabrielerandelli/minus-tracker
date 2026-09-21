import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * Regression: DEGIROParser's "--- Fees ---" block treated a BLANK
 * "Transaction costs currency" cell identically to a populated-but-unknown
 * currency code. Both fell through to the same lookupRate(currency, ...)
 * call, which returns null for an empty string, and the row was silently
 * dropped in full — not just the fee. A perfectly valid BUY or SELL leg with
 * a non-zero fee and a blank fee-currency cell (everything else populated)
 * therefore vanished from the parsed Transaction[], and a round-trip trade
 * built from such rows made Calculator.calculateGains() throw
 * CalculationError NO_OPEN_LOTS on the surviving SELL (matched against an
 * open lot that never existed because its BUY leg was dropped).
 *
 * Fix: a blank fee-currency cell (as opposed to a genuinely unrecognized,
 * non-blank one) is no longer treated as unresolvable. DEGIROParser now
 * assumes the fee is denominated in the trade's own already-resolved
 * "Local value currency" and keeps the row, while pushing a distinct
 * FEE_CURRENCY_ASSUMED warning so a user can double check their export.
 * Genuinely unsupported, non-blank fee-currency codes (e.g. "XYZ") still
 * drop the row with the pre-existing UNSUPPORTED_CURRENCY/NO_ECB_RATE
 * warnings, unchanged.
 */

const DEGIRO_HEADER =
  "Date,Time,Product,ISIN,Reference,Venue,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

const USD_RATE_2024_01_15 = 1.0875;
const USD_RATE_2024_06_20 = 1.0719;

describe("regression: DEGIRO blank fee-currency cell no longer drops the whole transaction row", () => {
  // BUY: fee is non-zero but "Transaction costs currency" is left blank
  // (the two commas back-to-back before the next populated field). Every
  // other required column is present and populated.
  const BUY =
    "15-01-2024,10:00,SPDR S&P 500 ETF,US78462F1030,,NDQ,10,450.25,-4502.50,USD,-4502.50,USD,1.0950,-1.50,,-4189.34,EUR,order-1";
  // SELL: fee currency explicitly populated (USD, matching the trade's own
  // currency) -- closes the round trip and is unaffected by the fix.
  const SELL =
    "20-06-2024,10:00,SPDR S&P 500 ETF,US78462F1030,,NDQ,-10,470.10,4701.00,USD,4701.00,USD,1.0719,-1.50,USD,4384.27,EUR,order-2";

  const csv = [DEGIRO_HEADER, BUY, SELL].join("\n");
  const snapshot = {
    USD: {
      "2024-01-15": USD_RATE_2024_01_15,
      "2024-06-20": USD_RATE_2024_06_20,
    },
  };

  it("keeps both the BUY and SELL legs instead of dropping the blank-fee-currency BUY", () => {
    const parser = new DEGIROParser(snapshot);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(2);
    expect(transactions.filter((t) => t.type === "BUY")).toHaveLength(1);
    expect(transactions.filter((t) => t.type === "SELL")).toHaveLength(1);
  });

  it("prices the blank-currency fee by assuming the trade's own (USD) currency, not zero and not un-converted", () => {
    const parser = new DEGIROParser(snapshot);
    const transactions = parser.parse(csv);
    const buyTx = transactions.find((t) => t.type === "BUY")!;
    const expectedFeeEUR = 1.5 / USD_RATE_2024_01_15;
    expect(buyTx.feesEUR).toBeCloseTo(expectedFeeEUR, 6);
    expect(buyTx.feesEUR).not.toBe(0);
    // Assumed currency equals the trade's own currency, so — mirroring the
    // existing "fee currency equals trade currency" behavior — feesFxRate/
    // feesCurrency stay unstamped (no separate FX leg to report).
    expect(buyTx.feesFxRate).toBeUndefined();
    expect(buyTx.feesCurrency).toBeUndefined();
  });

  it("emits a FEE_CURRENCY_ASSUMED warning naming the assumed currency, not UNSUPPORTED_CURRENCY", () => {
    const parser = new DEGIROParser(snapshot);
    parser.parse(csv);
    expect(
      parser.warningEntries.some(
        (w) => w.code === "FEE_CURRENCY_ASSUMED" && w.currency === "USD",
      ),
    ).toBe(true);
    expect(
      parser.warningEntries.some((w) => w.code === "UNSUPPORTED_CURRENCY"),
    ).toBe(false);
  });

  it("no longer throws CalculationError NO_OPEN_LOTS — Calculator matches the round trip cleanly", () => {
    const parser = new DEGIROParser(snapshot);
    const transactions = parser.parse(csv);
    expect(() =>
      new Calculator(transactions).calculateGains("FIFO"),
    ).not.toThrow();
  });

  it("computes a numerically sane gain for the round trip", () => {
    const parser = new DEGIROParser(snapshot);
    const transactions = parser.parse(csv);
    const report = new Calculator(transactions).calculateGains("FIFO");

    expect(report.lots).toHaveLength(1);
    const lot = report.lots[0];

    const buyFeeEUR = 1.5 / USD_RATE_2024_01_15;
    const sellFeeEUR = 1.5 / USD_RATE_2024_06_20;
    const buyCostEUR = 4502.5 / USD_RATE_2024_01_15 + buyFeeEUR;
    const sellProceedsEUR = 4701.0 / USD_RATE_2024_06_20 - sellFeeEUR;
    const expectedGain = sellProceedsEUR - buyCostEUR;

    expect(lot.buyCostEUR).toBeCloseTo(buyCostEUR, 2);
    expect(lot.sellProceedsEUR).toBeCloseTo(sellProceedsEUR, 2);
    expect(lot.gainLossEUR).toBeCloseTo(expectedGain, 2);
    expect(report.netResult).toBeCloseTo(expectedGain, 2);
  });
});

describe("regression guard: a genuinely unsupported (non-blank) fee currency still drops the row unchanged", () => {
  const csv = [
    DEGIRO_HEADER,
    "11-03-2024,09:00,Yen Fee Corp,DE0008888888,,XETR,100,10.00,-1000.00,EUR,-1000.00,EUR,1.0,-11.00,JPY,-1011.00,EUR,order-1",
  ].join("\n");

  it("still skips the row and pushes UNSUPPORTED_CURRENCY, not FEE_CURRENCY_ASSUMED", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(
      parser.warningEntries.some(
        (w) => w.code === "UNSUPPORTED_CURRENCY" && w.currency === "JPY",
      ),
    ).toBe(true);
    expect(
      parser.warningEntries.some((w) => w.code === "FEE_CURRENCY_ASSUMED"),
    ).toBe(false);
  });
});
