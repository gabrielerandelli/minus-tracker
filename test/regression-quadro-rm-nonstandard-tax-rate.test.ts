import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { Calculator } from "../src/calculator/index.js";
import { CalculationError } from "../src/errors.js";
import type { ClassificationMap } from "../src/types.js";

/**
 * Regression: a Bucket A (redditi di capitale) gain classified with a
 * non-standard `taxRate` (anything other than exactly 0.26 or 0.125) must
 * never silently vanish from the Modello Redditi PF Quadro RM export.
 *
 * Before the fix: `Calculator.calculateGains()`'s Bucket A aggregation
 * (src/calculator/index.ts) groups generically by whatever numeric `taxRate`
 * is present in the caller-supplied `ClassificationMap` — so
 * `report.bucketA.groups` correctly showed a taxRate:0.20 group with the
 * right plusvalenze/imposta. But `buildQuadroRM()`
 * (src/dichiarazione/engine.ts) only ever looks for exactly `taxRate === 0.26`
 * or `taxRate === 0.125` when building `report.dichiarazione.quadroRM` — the
 * actual tax-filing document `dichiarazione.exportTo()` writes to disk. A
 * 0.20-rate group matched neither lookup and was silently dropped: real,
 * correctly-computed taxable income disappeared from the filing export with
 * no warning, no error, and no trace in `report.warnings`.
 *
 * ClassificationEntry.taxRate is a plain `number` with no compile-time or
 * runtime restriction — any downstream consumer (a hand-edited
 * `*.classify.json` sidecar with `confirmedByUser: true`, or a
 * directly-constructed ClassificationMap) can supply any value here. Since
 * Italian tax law recognizes exactly two rates for Bucket A (26% standard,
 * 12.5% for whitelisted government bonds per Art. 68 co. 5 TUIR — see
 * AGENTS.md's "Italian tax correctness is non-negotiable"), any other rate on
 * a Bucket-A-gain entry is invalid/corrupt input, not a legitimate third tax
 * bucket. The fix makes Calculator reject it loudly (CalculationError,
 * code "INVALID_TAX_RATE") the moment it would be aggregated into
 * `report.bucketA.groups`, before it can ever reach — and silently vanish
 * from — `report.dichiarazione.quadroRM`.
 */

const NONSTANDARD_ISIN = "IE00BK5BQT80";

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Venue,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
const BUY = `01-02-2024,10:00,VWCE ETF,${NONSTANDARD_ISIN},XET,XET,100,90.00,-9000.00,EUR,-9000.00,EUR,,-1.00,EUR,-9001.00,EUR,o1`;
const SELL = `01-08-2024,10:00,VWCE ETF,${NONSTANDARD_ISIN},XET,XET,-100,110.00,11000.00,EUR,11000.00,EUR,,-1.00,EUR,10999.00,EUR,o2`;
const csv = [HEADER, BUY, SELL].join("\n");

// A user hand-corrected/hand-supplied classification entry with a
// non-standard Bucket A tax rate (nothing in the public
// ClassificationEntry/ClassificationMap type restricts taxRate to
// {0.26, 0.125}).
const classification: ClassificationMap = {
  [NONSTANDARD_ISIN]: {
    product: "VWCE ETF",
    assetClass: "ETF",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.2,
    whiteListed: null,
    confirmedByUser: true,
    source: "user",
  },
};

describe("Regression: Bucket A gain with non-standard taxRate must not silently vanish from Quadro RM", () => {
  it("Calculator.calculateGains throws CalculationError with code INVALID_TAX_RATE instead of producing a report", () => {
    const transactions = new DEGIROParser().parse(csv);
    const calc = new Calculator(transactions, [], { classification });

    expect(() => calc.calculateGains("LIFO")).toThrow(CalculationError);

    let caught: unknown;
    try {
      calc.calculateGains("LIFO");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CalculationError);
    const err = caught as CalculationError;
    expect(err.code).toBe("INVALID_TAX_RATE");
    expect(err.isin).toBe(NONSTANDARD_ISIN);
    expect(err.taxRate).toBe(0.2);
  });

  it("does not reject the two legitimate Bucket A rates (0.26 and 0.125)", () => {
    const transactions = new DEGIROParser().parse(csv);

    const standardClassification: ClassificationMap = {
      [NONSTANDARD_ISIN]: {
        ...classification[NONSTANDARD_ISIN],
        taxRate: 0.26,
      },
    };
    const calc26 = new Calculator(transactions, [], {
      classification: standardClassification,
    });
    expect(() => calc26.calculateGains("LIFO")).not.toThrow();
    const report26 = calc26.calculateGains("LIFO");
    expect(report26.bucketA!.groups[0].taxRate).toBe(0.26);
    expect(report26.dichiarazione!.quadroRM.capitaleAliquota26.plusvalenze).toBe(
      report26.bucketA!.groups[0].plusvalenze,
    );

    const wlClassification: ClassificationMap = {
      [NONSTANDARD_ISIN]: {
        ...classification[NONSTANDARD_ISIN],
        taxRate: 0.125,
      },
    };
    const calc125 = new Calculator(transactions, [], {
      classification: wlClassification,
    });
    const report125 = calc125.calculateGains("LIFO");
    expect(report125.bucketA!.groups[0].taxRate).toBe(0.125);
    expect(
      report125.dichiarazione!.quadroRM.capitaleAliquota125.plusvalenze,
    ).toBe(report125.bucketA!.groups[0].plusvalenze);
  });
});
