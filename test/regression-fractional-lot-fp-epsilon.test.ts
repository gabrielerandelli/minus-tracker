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
