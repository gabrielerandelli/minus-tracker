import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { Calculator } from "../src/calculator/index.js";
import type { LotMethod } from "../src/types.js";

/**
 * Regression: fractional-share position closed across multiple SELLs must not
 * throw CalculationError due to floating-point epsilon residue in the
 * LIFO/FIFO lot-matching loop.
 *
 * BUY  0.3 shares @ 100 EUR
 * SELL 0.1 shares @ 100 EUR
 * SELL 0.2 shares @ 100 EUR
 *
 * 0.1 + 0.2 sums exactly (mathematically) to the 0.3 bought, but
 * 0.3 - 0.1 - 0.19999999999999998 leaves a ~2.22e-17 epsilon residue in
 * floating point, which previously caused a spurious "No open lots" error
 * on the second SELL even though the position was fully and correctly closed.
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
const BUY =
  "10-01-2024,09:05,Fractional Corp,US0000000001,XNAS,XNAS,0.3,100.00,-30.00,EUR,-30.00,EUR,1,0.00,EUR,-30.00,EUR,ord-1";
const SELL1 =
  "15-01-2024,09:05,Fractional Corp,US0000000001,XNAS,XNAS,-0.1,100.00,10.00,EUR,10.00,EUR,1,0.00,EUR,10.00,EUR,ord-2";
const SELL2 =
  "20-01-2024,09:05,Fractional Corp,US0000000001,XNAS,XNAS,-0.2,100.00,20.00,EUR,20.00,EUR,1,0.00,EUR,20.00,EUR,ord-3";

const csv = [HEADER, BUY, SELL1, SELL2].join("\n");

function runFor(method: LotMethod) {
  const transactions = new DEGIROParser().parse(csv);
  return new Calculator(transactions).calculateGains(method);
}

describe("regression: fractional-share BUY closed across two SELLs (FP epsilon)", () => {
  for (const method of ["LIFO", "FIFO"] as const) {
    describe(`${method}`, () => {
      it("does not throw CalculationError", () => {
        expect(() => runFor(method)).not.toThrow();
      });

      it("produces exactly two matched lots with the correct quantities", () => {
        const report = runFor(method);
        expect(report.lots).toHaveLength(2);
        const quantities = report.lots.map((l) => l.quantity).sort((a, b) => a - b);
        expect(quantities[0]).toBeCloseTo(0.1, 9);
        expect(quantities[1]).toBeCloseTo(0.2, 9);
      });

      it("both matched lots have zero gain/loss (buy price == sell price, no fees)", () => {
        const report = runFor(method);
        for (const lot of report.lots) {
          expect(lot.gainLossEUR).toBe(0);
        }
      });

      it("netResult is 0", () => {
        const report = runFor(method);
        expect(report.netResult).toBe(0);
        expect(report.plusvalenze).toBe(0);
        expect(report.minusvalenze).toBe(0);
      });
    });
  }
});

/**
 * Regression: a multi-fill fractional-share close must not leak raw IEEE-754 floating-point
 * noise into the *public* `MatchedLot.quantity` field (part of the frozen GainsReport contract,
 * and printed verbatim by the CLI renderer).
 *
 * BUY  0.5 shares (older lot)
 * BUY  0.7 shares (newer lot)
 * SELL 0.9 shares (partial close — 0.3 remains open)
 *
 * Under LIFO, the SELL first fully consumes the 0.7-share lot (matchedQty = 0.7, clean), then
 * must match 0.9 - 0.7 against the 0.5-share lot. In IEEE-754 double precision,
 * 0.9 - 0.7 === 0.19999999999999998 (not the clean 0.2 the user actually traded), and without a
 * fix that noisy remainder flows straight through Math.min() into the second matched lot's
 * `quantity` — a value no user ever entered.
 */
const HEADER3 =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
const BUY_OLD =
  "02-01-2024,10:00,Noisy Corp,US0000000003,XNAS,XNAS,0.5,150.00,-75.00,EUR,-75.00,EUR,1,0.00,EUR,-75.00,EUR,id1";
const BUY_NEW =
  "05-01-2024,10:00,Noisy Corp,US0000000003,XNAS,XNAS,0.7,160.00,-112.00,EUR,-112.00,EUR,1,0.00,EUR,-112.00,EUR,id2";
const SELL_PARTIAL =
  "01-02-2024,10:00,Noisy Corp,US0000000003,XNAS,XNAS,-0.9,170.00,153.00,EUR,153.00,EUR,1,0.00,EUR,153.00,EUR,id3";

describe("regression: MatchedLot.quantity is a clean decimal, not raw FP noise (0.9 - 0.7 case)", () => {
  it("LIFO: second matched lot's quantity is exactly 0.2 (not 0.19999999999999998 / 0.20000000000000007-style noise)", () => {
    const csvNoisy = [HEADER3, BUY_OLD, BUY_NEW, SELL_PARTIAL].join("\n");
    const transactions = new DEGIROParser().parse(csvNoisy);
    const report = new Calculator(transactions).calculateGains("LIFO");

    expect(report.lots).toHaveLength(2);
    // First matched lot: the 0.7-share (newer) lot fully consumed.
    expect(report.lots[0].quantity).toBe(0.7);
    // Second matched lot: the remainder against the 0.5-share (older) lot — must be the clean
    // 0.2 the user actually traded, exactly, not floating-point residue that merely rounds to
    // something close to it.
    expect(report.lots[1].quantity).toBe(0.2);

    // The still-open 0.3 remainder on the older lot must also be clean: sell 0.3 more and the
    // position must close exactly, with no residual "phantom" quantity left behind or a
    // spurious oversell error triggered by noise.
    const closeCsv = [
      HEADER3,
      BUY_OLD,
      BUY_NEW,
      SELL_PARTIAL,
      "10-02-2024,10:00,Noisy Corp,US0000000003,XNAS,XNAS,-0.3,180.00,54.00,EUR,54.00,EUR,1,0.00,EUR,54.00,EUR,id4",
    ].join("\n");
    const closeTx = new DEGIROParser().parse(closeCsv);
    const closeReport = new Calculator(closeTx).calculateGains("LIFO");
    expect(closeReport.lots).toHaveLength(3);
    expect(closeReport.lots[2].quantity).toBe(0.3);
  });

  it("FIFO: second matched lot's quantity is exactly 0.2 for an equivalent construction", () => {
    // Under FIFO the *oldest* lot is consumed first. To exercise the same inexact-subtraction
    // path as the LIFO case above (0.9 - 0.7 = 0.19999999999999998 in IEEE-754), make the
    // 0.7-share lot the oldest one: FIFO consumes it first (matchedQty = 0.7, clean), then
    // matches the inexact remainder against the 0.5-share lot — the mirror image of the LIFO
    // case above.
    const BUY_A =
      "02-01-2024,10:00,Noisy Corp,US0000000004,XNAS,XNAS,0.7,150.00,-105.00,EUR,-105.00,EUR,1,0.00,EUR,-105.00,EUR,id1";
    const BUY_B =
      "05-01-2024,10:00,Noisy Corp,US0000000004,XNAS,XNAS,0.5,160.00,-80.00,EUR,-80.00,EUR,1,0.00,EUR,-80.00,EUR,id2";
    const SELL_B =
      "01-02-2024,10:00,Noisy Corp,US0000000004,XNAS,XNAS,-0.9,170.00,153.00,EUR,153.00,EUR,1,0.00,EUR,153.00,EUR,id3";
    const csv4 = [HEADER3, BUY_A, BUY_B, SELL_B].join("\n");
    const transactions = new DEGIROParser().parse(csv4);
    const report = new Calculator(transactions).calculateGains("FIFO");

    expect(report.lots).toHaveLength(2);
    expect(report.lots[0].quantity).toBe(0.7);
    expect(report.lots[1].quantity).toBe(0.2);
  });

  it("generalizes to other non-representable fractional pairs (0.1 + 0.2 style values), not just the 0.5/0.7 example", () => {
    // BUY 0.6 + 0.3 (older/newer), SELL 0.8 under LIFO: consumes the 0.3-share lot fully
    // (matchedQty = 0.3, clean), then needs 0.8 - 0.3 against the 0.6-share lot. In IEEE-754,
    // 0.8 - 0.3 === 0.5000000000000001 (noise), not the clean 0.5 actually traded.
    const BUY_C =
      "02-01-2024,10:00,Noisy Corp,US0000000005,XNAS,XNAS,0.6,150.00,-90.00,EUR,-90.00,EUR,1,0.00,EUR,-90.00,EUR,id1";
    const BUY_D =
      "05-01-2024,10:00,Noisy Corp,US0000000005,XNAS,XNAS,0.3,160.00,-48.00,EUR,-48.00,EUR,1,0.00,EUR,-48.00,EUR,id2";
    const SELL_C =
      "01-02-2024,10:00,Noisy Corp,US0000000005,XNAS,XNAS,-0.8,170.00,136.00,EUR,136.00,EUR,1,0.00,EUR,136.00,EUR,id3";
    const csv5 = [HEADER3, BUY_C, BUY_D, SELL_C].join("\n");
    const transactions = new DEGIROParser().parse(csv5);
    const report = new Calculator(transactions).calculateGains("LIFO");

    expect(report.lots).toHaveLength(2);
    expect(report.lots[0].quantity).toBe(0.3);
    expect(report.lots[1].quantity).toBe(0.5);
  });
});

/**
 * Regression: a position built from several independently-8dp-rounded fractional BUYs, then
 * closed with a single round-number SELL, must not throw CalculationError even though the BUYs'
 * quantities don't re-sum to the SELL's quantity to the last decimal place.
 *
 * BUY  0.33333333 shares (x3, three different dates) -- DEGIRO's own real fractional-share
 *      export precision (8 decimal places) -- summing to 0.99999999, one hundred-millionth of a
 *      share short of 1.0 purely because 0.33333333 rounded to 8dp three times over never
 *      re-sums to exactly 1.
 * SELL 1.00000000 shares -- exactly what a broker's own UI would show for "close full position",
 *      and what any user tracking "I own 1 share" would naturally enter.
 *
 * This residual (1e-8) sits exactly at the QUANTITY_DECIMALS precision floor -- one order of
 * magnitude coarser than QUANTITY_EPSILON (1e-9), which is tuned for pure IEEE-754 arithmetic
 * noise (~1e-17), not broker-rounding residue. Before the fix, this SELL correctly consumed all
 * three open lots but was left with remainingSellQty == 1e-8 and no lots left, and threw
 * NO_OPEN_LOTS even though the position was, for all real-world purposes, fully and correctly
 * closed.
 */
const HEADER5 =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
const FRAC_BUY_1 =
  "20-03-2024,09:00,Fractional Corp,US0000000006,XNAS,XNAS,0.33333333,150.00,-50.00,USD,-50.00,USD,1.0,0.10,USD,-50.10,USD,order-1";
const FRAC_BUY_2 =
  "21-03-2024,09:00,Fractional Corp,US0000000006,XNAS,XNAS,0.33333333,151.00,-50.33,USD,-50.33,USD,1.0,0.10,USD,-50.43,USD,order-2";
const FRAC_BUY_3 =
  "22-03-2024,09:00,Fractional Corp,US0000000006,XNAS,XNAS,0.33333333,152.00,-50.67,USD,-50.67,USD,1.0,0.10,USD,-50.77,USD,order-3";
const FRAC_SELL_FULL =
  "25-03-2024,09:00,Fractional Corp,US0000000006,XNAS,XNAS,-1.00000000,155.00,155.00,USD,155.00,USD,1.0,0.10,USD,154.90,USD,order-4";

const fracCsv = [HEADER5, FRAC_BUY_1, FRAC_BUY_2, FRAC_BUY_3, FRAC_SELL_FULL].join("\n");

function runFracFor(method: LotMethod) {
  const transactions = new DEGIROParser().parse(fracCsv);
  return new Calculator(transactions).calculateGains(method);
}

describe("regression: three 8dp-rounded fractional BUYs closed by a round-number SELL (broker-rounding residual, not FP noise)", () => {
  for (const method of ["LIFO", "FIFO"] as const) {
    describe(`${method}`, () => {
      it("does not throw CalculationError", () => {
        expect(() => runFracFor(method)).not.toThrow();
      });

      it("produces exactly three matched lots covering the full bought quantity", () => {
        const report = runFracFor(method);
        expect(report.lots).toHaveLength(3);
        // The three matched lots' quantities sum to what was actually bought (0.99999999 — the
        // three 8dp-rounded BUYs), not the SELL's own 1.00000000: the leftover 1e-8
        // broker-rounding residual has no cost basis to attribute, so it's absorbed as a clean
        // close (the loop simply exits once lots are exhausted) rather than fabricated into an
        // extra or oversized matched-lot quantity.
        const totalMatched = report.lots.reduce((sum, l) => sum + l.quantity, 0);
        expect(totalMatched).toBeCloseTo(0.99999999, 8);
        for (const lot of report.lots) {
          expect(lot.quantity).toBeCloseTo(0.33333333, 8);
        }
      });
    });
  }
});

/**
 * Regression: the broker-rounding-residual tolerance above (SELL_CLOSE_TOLERANCE, fixed at 5e-8)
 * was derived from a *3-lot* example and does not scale with the number of lots consumed by a
 * single SELL. With N independently-8dp-rounded BUY lots of a repeating fraction, each lot's own
 * rounding contributes up to 0.5e-8 of worst-case residual, so the worst-case *cumulative*
 * residual across N lots grows roughly linearly with N — for N=107 it reaches ~4.7e-7, about
 * 9.4x the old fixed 5e-8 tolerance.
 *
 * This is entirely realistic: DEGIRO and IBKR both support recurring/fractional investment plans
 * that place many small BUYs over months (daily/weekly), easily reaching 100+ lots on one ISIN.
 *
 * BUY  0.00934579 shares (= round(1/107, 8dp)) x107, on 107 consecutive calendar days starting
 *      2024-01-02, 400.00 EUR each, zero fees. These 107 independently-8dp-rounded quantities sum
 *      to 0.99999953 (not the mathematically-exact 1.0), a broker-rounding residual of 4.7e-7.
 * SELL 1.00000000 shares the day after the last BUY, at 450.00 EUR, zero fees — exactly what a
 *      broker's own UI would show for "close full position".
 *
 * Before the fix, this SELL correctly consumed all 107 open lots but was left with
 * remainingSellQty == 4.7e-7 and no lots left; since 4.7e-7 > the old fixed 5e-8 tolerance, it
 * threw NO_OPEN_LOTS even though the position was, for all real-world purposes, fully and
 * correctly closed.
 */
const N_LOTS = 107;
const LOT_QTY = "0.00934579"; // round(1/107, 8dp)
const LOT_PRICE_EUR = 400.0;
const SELL_PRICE_EUR = 450.0;
const REPEATING_ISIN = "US0000000001";

function fmtDDMMYYYY(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function buildRepeatingFractionCsv(): { csv: string; sellDate: string } {
  const header =
    "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
  const rows = [header];
  const start = Date.UTC(2024, 0, 2); // 2024-01-02
  const lotQtyNum = parseFloat(LOT_QTY);
  const localValue = (-lotQtyNum * LOT_PRICE_EUR).toFixed(2);

  for (let i = 0; i < N_LOTS; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = fmtDDMMYYYY(d);
    rows.push(
      `${dateStr},09:00,Repeating Corp,${REPEATING_ISIN},XNAS,XNAS,${LOT_QTY},${LOT_PRICE_EUR.toFixed(2)},${localValue},EUR,${localValue},EUR,1,0.00,EUR,${localValue},EUR,buy-${i}`,
    );
  }

  const sellDateObj = new Date(start);
  sellDateObj.setUTCDate(sellDateObj.getUTCDate() + N_LOTS);
  const sellDate = fmtDDMMYYYY(sellDateObj);
  const sellValue = SELL_PRICE_EUR.toFixed(2);
  rows.push(
    `${sellDate},09:00,Repeating Corp,${REPEATING_ISIN},XNAS,XNAS,-1.00000000,${SELL_PRICE_EUR.toFixed(2)},${sellValue},EUR,${sellValue},EUR,1,0.00,EUR,${sellValue},EUR,sell-1`,
  );

  return { csv: rows.join("\n"), sellDate };
}

function runRepeatingFractionFor(method: LotMethod) {
  const { csv } = buildRepeatingFractionCsv();
  const transactions = new DEGIROParser().parse(csv);
  return new Calculator(transactions).calculateGains(method);
}

describe("regression: N=107 independently-8dp-rounded fractional BUYs closed by a round-number SELL (residual scales with lot count)", () => {
  it("sanity: parsing produces 108 transactions with zero warnings, and total BUY quantity is the expected broker-rounding residual", () => {
    const { csv } = buildRepeatingFractionCsv();
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(N_LOTS + 1);

    const totalBuyQty = transactions
      .filter((t) => t.type === "BUY")
      .reduce((sum, t) => sum + t.quantity, 0);
    expect(totalBuyQty).toBeCloseTo(0.99999953, 8);
  });

  for (const method of ["LIFO", "FIFO"] as const) {
    describe(`${method}`, () => {
      it("does not throw CalculationError", () => {
        expect(() => runRepeatingFractionFor(method)).not.toThrow();
      });

      it("matched lots sum to the actual bought quantity (~0.99999953), not the SELL's 1.00000000", () => {
        const report = runRepeatingFractionFor(method);
        expect(report.lots).toHaveLength(N_LOTS);
        const totalMatched = report.lots.reduce((sum, l) => sum + l.quantity, 0);
        expect(totalMatched).toBeCloseTo(0.99999953, 8);
        expect(totalMatched).not.toBeCloseTo(1.0, 8);
      });

      it("plusvalenze/minusvalenze/netResult are sane: a plusvalenza of roughly (450-400)*0.99999953", () => {
        const report = runRepeatingFractionFor(method);
        // Each of the 107 matched lots' gainLossEUR is independently rounded to the nearest cent
        // (roundHalfUp) before summing — e.g. (450-400)*0.00934579 = 0.4672895 rounds to 0.47 per
        // lot — so the aggregate plusvalenza carries up to ~107 * 0.005 = ~0.53 EUR of cumulative
        // per-lot cent-rounding on top of the "ideal" (450-400)*0.99999953 figure. That per-lot
        // rounding is pre-existing, correct behavior (not part of this bug or its fix), so this
        // sanity check allows for it rather than asserting an exact-to-the-cent match.
        const expectedGain = (SELL_PRICE_EUR - LOT_PRICE_EUR) * 0.99999953;
        expect(report.minusvalenze).toBe(0);
        expect(report.plusvalenze).toBeCloseTo(expectedGain, 0);
        expect(report.netResult).toBeCloseTo(expectedGain, 0);
        expect(report.netResult).toBeGreaterThan(0);
      });
    });
  }
});

describe("regression: genuine insufficient-open-lots still throws (not masked by epsilon fix)", () => {
  const HEADER2 =
    "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
  const BUY2 =
    "10-01-2024,09:05,Fractional Corp,US0000000002,XNAS,XNAS,0.3,100.00,-30.00,EUR,-30.00,EUR,1,0.00,EUR,-30.00,EUR,ord-1";
  // Sells 0.31 total — 0.01 more than was ever bought, far larger than any
  // floating-point epsilon, so this must still be rejected as a real mismatch.
  const SELL_OVER =
    "20-01-2024,09:05,Fractional Corp,US0000000002,XNAS,XNAS,-0.31,100.00,31.00,EUR,31.00,EUR,1,0.00,EUR,31.00,EUR,ord-2";

  for (const method of ["LIFO", "FIFO"] as const) {
    it(`${method}: throws CalculationError when selling more than was ever bought`, () => {
      const csvOver = [HEADER2, BUY2, SELL_OVER].join("\n");
      const transactions = new DEGIROParser().parse(csvOver);
      expect(() =>
        new Calculator(transactions).calculateGains(method),
      ).toThrow();
    });
  }
});
