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
