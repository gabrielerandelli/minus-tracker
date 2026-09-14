import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * Regression: DEGIROParser's "--- Fees ---" section treated the "Transaction
 * costs" column's numeric value as already being in EUR, completely ignoring
 * the adjacent "Transaction costs currency" column. A real DEGIRO scenario
 * (e.g. an FX/connectivity surcharge billed in a currency different from the
 * trade's own "Local value currency") therefore had its fee silently
 * mis-priced — no ECB conversion, no warning — corrupting the resulting
 * plusvalenza/minusvalenza by the fee's FX delta.
 *
 * Fix: DEGIROParser now looks up the ECB rate for "Transaction costs
 * currency" (same lookupRate()/3-day-walkback semantics already used for the
 * trade side), converts the fee to EUR, warns (NO_ECB_RATE /
 * UNSUPPORTED_CURRENCY) instead of silently mis-pricing when no rate is
 * found, and — mirroring IBKRParser's commission-FX handling exactly —
 * stamps Transaction.feesFxRate/feesCurrency only when the fee currency
 * differs from the trade's own currency.
 *
 * The bundled ECB USD rate for 2024-03-11 is 1.0926 (src/data/ecb-rates.json),
 * so an 11.00 USD fee converts to 11.00 / 1.0926 = 10.067728354384037 EUR —
 * not 11.00 EUR as the bug produced.
 */

const DEGIRO_HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

const USD_FEE_RATE_2024_03_11 = 1.0926;
const EXPECTED_FEE_EUR = 11.0 / USD_FEE_RATE_2024_03_11; // 10.067728354384037

describe("regression: DEGIRO fee billed in a currency different from the trade's own currency is FX-converted to EUR", () => {
  // BUY: trade itself is EUR-denominated (Local value currency = EUR), but
  // the fee is billed in USD -- e.g. a real DEGIRO FX/connectivity surcharge
  // on a EUR-listed instrument.
  const BUY =
    "11-03-2024,09:00,Test EUR Stock,DE0001234567,XETR,XETR,100,10.00,-1000.00,EUR,-1000.00,EUR,1.0,-11.00,USD,-1011.00,EUR,order-1";
  // SELL: pure EUR, no fee-currency distortion -- isolates the bug to the BUY leg.
  const SELL =
    "16-09-2024,09:00,Test EUR Stock,DE0001234567,XETR,XETR,-100,12.00,1200.00,EUR,1200.00,EUR,1.0,-5.00,EUR,1195.00,EUR,order-2";

  const csv = [DEGIRO_HEADER, BUY, SELL].join("\n");

  it("converts the USD-billed fee to EUR via the bundled ECB rate, not 1:1", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const buyTx = transactions.find((t) => t.type === "BUY");
    expect(buyTx).toBeDefined();
    // Before the fix this was exactly 11 (the raw USD figure, un-converted).
    expect(buyTx!.feesEUR).not.toBeCloseTo(11.0, 6);
    expect(buyTx!.feesEUR).toBeCloseTo(EXPECTED_FEE_EUR, 6);
  });

  it("stamps feesFxRate/feesCurrency on the BUY leg since the fee currency (USD) differs from the trade currency (EUR)", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const buyTx = transactions.find((t) => t.type === "BUY");
    expect(buyTx!.feesFxRate).toBeCloseTo(USD_FEE_RATE_2024_03_11, 6);
    expect(buyTx!.feesCurrency).toBe("USD");
  });

  it("does not stamp feesFxRate/feesCurrency on the pure-EUR SELL leg", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const sellTx = transactions.find((t) => t.type === "SELL");
    expect(sellTx!.feesFxRate).toBeUndefined();
    expect(sellTx!.feesCurrency).toBeUndefined();
    expect(sellTx!.feesEUR).toBeCloseTo(5.0, 6);
  });

  it("propagates into a tax-correct gainLossEUR via Calculator, not the pre-fix mis-priced figure", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const report = new Calculator(transactions).calculateGains("FIFO");

    expect(report.lots).toHaveLength(1);
    const lot = report.lots[0];

    // buyCostEUR must include the correctly-converted fee: 1000 (local value)
    // + 10.067728354384037 (converted fee) = 1010.067728354384037, rounded to
    // 2dp by the Calculator (MatchedLot fields are reported rounded).
    expect(lot.buyCostEUR).toBeCloseTo(1000 + EXPECTED_FEE_EUR, 2);
    // Before the fix this would have been 1011 (raw 11 USD treated as EUR).
    expect(lot.buyCostEUR).not.toBeCloseTo(1011, 2);
    // sellProceedsEUR: 1200 - 5 (pure EUR fee) = 1195
    expect(lot.sellProceedsEUR).toBeCloseTo(1195, 6);

    const expectedGain = 1195 - (1000 + EXPECTED_FEE_EUR);
    expect(lot.gainLossEUR).toBeCloseTo(expectedGain, 2);
    // netResult is rounded to 2dp per GainsReport's contract.
    expect(report.netResult).toBeCloseTo(184.93, 2);
    // Before the fix, the gain was reported as 184 (buyCostEUR mis-priced
    // at 1011, un-converted). The tax-correct figure is ~184.93.
    expect(report.netResult).not.toBeCloseTo(184, 2);
  });

  it("records the USD fee rate for 2024-03-11 in Calculator's ratesUsed map, keyed by fee currency and trade date", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const report = new Calculator(transactions).calculateGains("FIFO");
    expect(report.ratesUsed["USD:2024-03-11"]).toBeCloseTo(
      USD_FEE_RATE_2024_03_11,
      6,
    );
  });

  it("emits no warnings for this well-formed (if unusual) input", () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.warnings).toEqual([]);
  });
});

describe("regression guard: a non-EUR fee with no ECB rate available for its date warns instead of silently mis-pricing", () => {
  // GBP has bundled rates, but 2099-01-01 is far outside any real coverage
  // window -- lookupRate's 3-trading-day walkback will find nothing.
  const csv = [
    DEGIRO_HEADER,
    "01-01-2099,09:00,Far Future Corp,DE0009999999,XETR,XETR,100,10.00,-1000.00,EUR,-1000.00,EUR,1.0,-11.00,GBP,-1011.00,EUR,order-1",
  ].join("\n");

  it("skips the row and pushes a NO_ECB_RATE warning for the fee currency, rather than reporting an un-converted fee", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(
      parser.warningEntries.some(
        (w) => w.code === "NO_ECB_RATE" && w.currency === "GBP",
      ),
    ).toBe(true);
  });
});

describe("regression guard: an unsupported fee currency warns instead of silently mis-pricing", () => {
  const csv = [
    DEGIRO_HEADER,
    "11-03-2024,09:00,Yen Fee Corp,DE0008888888,XETR,XETR,100,10.00,-1000.00,EUR,-1000.00,EUR,1.0,-11.00,JPY,-1011.00,EUR,order-1",
  ].join("\n");

  it("skips the row and pushes an UNSUPPORTED_CURRENCY warning for the fee currency", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
    expect(
      parser.warningEntries.some(
        (w) => w.code === "UNSUPPORTED_CURRENCY" && w.currency === "JPY",
      ),
    ).toBe(true);
  });
});
