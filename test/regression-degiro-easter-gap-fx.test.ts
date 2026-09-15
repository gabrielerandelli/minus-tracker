import { describe, it, expect } from "vitest";
import { lookupRate, getActiveSnapshot } from "../src/rates/index.js";
import { DEGIROParser } from "../src/parser/index.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * Regression: lookupRate()'s weekend/holiday walkback was hard-coded to 3
 * calendar days, but the bundled ECB snapshot (src/data/ecb-rates.json) has
 * real calendar gaps of up to 5 days around recurring TARGET2 (eurozone)
 * holiday closures -- notably Easter (Good Friday + Easter Monday, both
 * TARGET2 holidays, bracketing a weekend) and the Christmas/New Year
 * cluster. Confirmed gap: the USD rate has no entry from 2024-03-28 (Thu)
 * through 2024-04-01 (Mon, Easter Monday) inclusive -- the next available
 * rate is 2024-04-02.
 *
 * Easter Monday is NOT a US market holiday (NYSE is open), so a completely
 * ordinary USD-denominated trade of a US stock placed on 2024-04-01 is
 * real, valid, and should be taxed. With the old 3-day window, lookupRate
 * could not bridge the 4-calendar-day distance back to 2024-03-28's rate,
 * returned null, and DEGIROParser/IBKRParser silently dropped the row (only
 * a NO_ECB_RATE warning, no error) -- potentially discarding a same-ISIN
 * SELL that would otherwise have matched an open lot, and with it a real
 * plusvalenza/minusvalenza, from the tax report entirely.
 *
 * Fix: lookupRate's walkback window widened from 3 to
 * MAX_LOOKBACK_DAYS = 5 calendar days (see src/rates/index.ts), enough to
 * bridge the worst real gap observed in the bundled snapshot (5 days, so at
 * most gap - 1 = 4 days of backward search from any date inside it) with
 * one full day of safety margin.
 */

const USD_RATE_2024_03_20 = 1.0844; // last real rate before the BUY leg
const USD_RATE_2024_03_28 = 1.0811; // last real rate before the Easter gap

describe("regression: lookupRate bridges the real 2024 Easter TARGET2-holiday gap in the bundled ECB snapshot", () => {
  it("lookupRate resolves 2024-04-01 (Easter Monday, no ECB entry) to the last real rate, 2024-03-28's 1.0811", () => {
    const snapshot = getActiveSnapshot();
    // Sanity-check the raw data actually has the gap this test exists for.
    expect(snapshot.USD["2024-04-01"]).toBeUndefined();
    expect(snapshot.USD["2024-03-29"]).toBeUndefined();
    expect(snapshot.USD["2024-03-30"]).toBeUndefined();
    expect(snapshot.USD["2024-03-31"]).toBeUndefined();
    expect(snapshot.USD["2024-03-28"]).toBeCloseTo(USD_RATE_2024_03_28, 6);

    const rate = lookupRate("USD", "2024-04-01", snapshot);
    expect(rate).toBeCloseTo(USD_RATE_2024_03_28, 6);
  });

  it("TC-011 still returns null for a date/currency pair with no rate anywhere near it (regression guard)", () => {
    // Same stub as test/TC-011.test.ts: nearest USD rate is over a month
    // away, well outside even the widened 5-day window.
    const STUB_RATES = {
      USD: { "2024-01-02": 1.25, "2024-01-05": 1.0941, "2024-06-03": 1.0 },
    };
    expect(lookupRate("USD", "2024-02-14", STUB_RATES)).toBeNull();
  });
});

describe("regression: a real DEGIRO round-trip closing on Easter Monday is not silently dropped from the tax report", () => {
  const DEGIRO_HEADER =
    "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

  // BUY: 10 shares of Apple, 20-03-2024, well clear of the Easter gap.
  const BUY =
    "20-03-2024,09:00,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,USD,-1500.00,USD,1.0,0.00,EUR,-1500.00,USD,order-1";
  // SELL: same 10 shares, 01-04-2024 -- Easter Monday, a real NYSE trading
  // day with no ECB USD entry for that date.
  const SELL =
    "01-04-2024,09:00,Apple Inc,US0378331005,XNAS,XNAS,-10,160.00,1600.00,USD,1600.00,USD,1.0,0.00,EUR,1600.00,USD,order-2";

  const csv = [DEGIRO_HEADER, BUY, SELL].join("\n");

  it("parses both legs (the Easter-Monday SELL is not skipped)", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    // Before the fix: length 1 (only the BUY survived).
    expect(transactions).toHaveLength(2);
    expect(transactions.find((t) => t.type === "SELL")).toBeDefined();
  });

  it("emits no NO_ECB_RATE warning for the SELL leg", () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.warnings).toEqual([]);
  });

  it("stamps the SELL leg's fxRate as the walked-back 2024-03-28 rate, not left unresolved", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const sellTx = transactions.find((t) => t.type === "SELL");
    expect(sellTx).toBeDefined();
    expect(sellTx!.fxRate).toBeCloseTo(USD_RATE_2024_03_28, 6);
  });

  it("Calculator('LIFO') matches the BUY/SELL pair into a real plusvalenza, not an empty lots array", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const report = new Calculator(transactions).calculateGains("LIFO");

    // Before the fix, the SELL row was dropped entirely, so `lots` would be
    // empty and no gain/loss would ever be reported for this position.
    expect(report.lots).toHaveLength(1);

    const lot = report.lots[0];
    const buyCostEUR = 1500 / USD_RATE_2024_03_20;
    const sellProceedsEUR = 1600 / USD_RATE_2024_03_28;
    const expectedGain = sellProceedsEUR - buyCostEUR;

    expect(lot.buyCostEUR).toBeCloseTo(buyCostEUR, 2);
    expect(lot.sellProceedsEUR).toBeCloseTo(sellProceedsEUR, 2);
    expect(lot.gainLossEUR).toBeCloseTo(expectedGain, 2);
    expect(lot.gainLossEUR).toBeGreaterThan(0); // a real plusvalenza, not zero/undefined

    expect(report.netResult).toBeCloseTo(expectedGain, 2);
  });

  it("records both legs' resolved rates in Calculator's ratesUsed map, keyed by the trade's own date", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const report = new Calculator(transactions).calculateGains("LIFO");

    expect(report.ratesUsed["USD:2024-03-20"]).toBeCloseTo(
      USD_RATE_2024_03_20,
      6,
    );
    // Keyed by the trade date itself (2024-04-01), even though the rate
    // value was resolved by walking back to 2024-03-28.
    expect(report.ratesUsed["USD:2024-04-01"]).toBeCloseTo(
      USD_RATE_2024_03_28,
      6,
    );
  });
});
