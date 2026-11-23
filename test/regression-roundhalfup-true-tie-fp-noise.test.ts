import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { Calculator } from "../src/calculator/index.js";

/**
 * Regression: roundHalfUp must round a TRUE half-cent tie UP (away from zero), even when the
 * value arriving at the rounding step is not the exact double closest to that tie, but a
 * neighboring double produced by prior IEEE-754 arithmetic (here, allocating a transaction fee
 * proportionally across a partially-sold BUY lot — a routine real-world scenario, not a
 * contrived input).
 *
 * BUY  2 units @ 45.00 EUR, feesEUR = 0.03 (whole-lot fee for both units)
 * SELL 1 unit  @ 90.88 EUR, feesEUR = 0.00 (full match against half the BUY lot, no fee)
 *
 * matchedQty = 1, originalQty = 2:
 *   allocatedBuyFeesEUR = 0.03 * (1/2) = 0.015
 *   buyCostEUR (raw)     = 90.00 * (1/2) + 0.015 = 45.015
 *   sellProceedsEUR      = 90.88 exactly (full match, no fee to allocate)
 *   gainLossEUR (raw)    = 90.88 - 45.015 = exactly 45.865 EUR in true decimal arithmetic — an
 *                          unambiguous half-cent tie that MUST round up to 45.87 per the
 *                          half-up contract (TC-026's own docstring: "Confirms the rounding
 *                          mode is half-up, not half-down or truncation").
 *
 * In IEEE-754 double precision, `90.88 - 45.015` does not land on the double closest to the
 * true decimal value 45.865; it lands on 45.864999999999995 instead — a hair below the tie.
 * The old `(Math.sign(x) * Math.round(Math.abs(x) * 100)) / 100` implementation multiplies
 * that already-short value by 100, landing on 4586.499999999999, which Math.round sends DOWN
 * to 4586, yielding the wrong 45.86 — silently under-reporting the taxable gain by one cent on
 * what is, mathematically, an exact tie.
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Venue,Quantity,Price,,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
const BUY =
  "02-01-2024,10:00,HALFCENT CO,US0000000555,NSD,NSD,2,45.00,,-90.00,EUR,-90.00,EUR,,-0.03,EUR,-90.03,EUR,b1";
const SELL =
  "03-06-2024,10:00,HALFCENT CO,US0000000555,NSD,NSD,-1,90.88,,90.88,EUR,90.88,EUR,,0.00,EUR,90.88,EUR,b2";

const csv = [HEADER, BUY, SELL].join("\n");

describe("regression: roundHalfUp rounds a true half-cent tie UP even when FP arithmetic lands a hair below it", () => {
  it("via the real public API (DEGIROParser + Calculator): buyCostEUR, gainLossEUR, plusvalenze and netResult are all correctly half-up rounded", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const report = new Calculator(
      transactions,
      parser.warnings,
      {},
    ).calculateGains("LIFO");

    expect(report.lots).toHaveLength(1);

    // buyCostEUR = 45.015 -> half-up -> 45.02 (this leg happens to already round correctly
    // even under the old, buggy implementation; asserted here as a sanity check on the fixture).
    expect(report.lots[0].buyCostEUR).toBe(45.02);

    // sellProceedsEUR needs no rounding: full match, zero fee.
    expect(report.lots[0].sellProceedsEUR).toBe(90.88);

    // The headline assertion: a true, exact 45.865 tie must round UP to 45.87, not down to
    // 45.86.
    expect(report.lots[0].gainLossEUR).toBe(45.87);

    // The top-level fiscal figures (feed Quadro RT/RM) must reflect the same correct cent.
    expect(report.plusvalenze).toBe(45.87);
    expect(report.minusvalenze).toBe(0);
    expect(report.netResult).toBe(45.87);
  });

  it("the negative mirror image (a true half-cent LOSS tie) also rounds away from zero, to -45.87", () => {
    // A different, independently-constructed fixture that produces the mirror-image bug: a
    // true -45.865 EUR loss tie where the raw IEEE-754 computation lands at
    // -45.864999999999994884 (a hair above/closer-to-zero than the true tie), which the old
    // `Math.round(Math.abs(x) * 100)` implementation rounds to -45.86 instead of -45.87.
    //
    // BUY_A: 1 unit @ 90.88 EUR, fee 0 (clean cost basis, no fee split needed — this is the
    //        lot under test).
    // BUY_B: 1 unit @ 10.00 EUR, fee 0 (just absorbs the other half of the SELL below; its own
    //        gain/loss is not a tie and is not asserted on).
    // SELL : 2 units @ 45.03 EUR, feesEUR = 0.03 total, split 1-and-1 across BUY_B (newest,
    //        sold first under LIFO) and BUY_A (this test's target).
    //        For the match against BUY_A: matchedQty = 1, tx.quantity = 2, so
    //        allocatedSellFeesEUR = 0.03 * (1/2) = 0.015 (raw: 0.014999999999999999445);
    //        sellProceedsEUR = 45.03 - 0.015 = 45.015 (raw: 45.015000000000000568);
    //        gainLossEUR = sellProceedsEUR - 90.88 = -45.865 EUR exactly, in true decimal
    //        arithmetic — again an unambiguous tie that must round AWAY from zero, to -45.87.
    const lossBuyA =
      "02-01-2024,10:00,HALFCENT CO,US0000000557,NSD,NSD,1,90.88,,-90.88,EUR,-90.88,EUR,,0.00,EUR,-90.88,EUR,b5";
    const lossBuyB =
      "03-01-2024,10:00,HALFCENT CO,US0000000557,NSD,NSD,1,10.00,,-10.00,EUR,-10.00,EUR,,0.00,EUR,-10.00,EUR,b6";
    const lossSell =
      "03-06-2024,10:00,HALFCENT CO,US0000000557,NSD,NSD,-2,45.03,,90.06,EUR,90.06,EUR,,0.03,EUR,90.03,EUR,b7";
    const lossCsv = [HEADER, lossBuyA, lossBuyB, lossSell].join("\n");

    const parser = new DEGIROParser();
    const transactions = parser.parse(lossCsv);
    const report = new Calculator(
      transactions,
      parser.warnings,
      {},
    ).calculateGains("LIFO");

    expect(report.lots).toHaveLength(2);
    // Under LIFO, BUY_B (newest) is matched first, BUY_A (this test's target) second.
    const targetLot = report.lots.find((l) => l.buyPriceEUR === 90.88);
    const otherLot = report.lots.find((l) => l.buyPriceEUR === 10.0);
    expect(targetLot).toBeDefined();
    expect(otherLot).toBeDefined();

    // The headline assertion: a true, exact -45.865 tie must round AWAY from zero, to -45.87,
    // not toward zero to -45.86.
    expect(targetLot!.gainLossEUR).toBe(-45.87);
    // BUY_B's own match is an ordinary (non-adversarial) half-up case, included only to give
    // this SELL a second lot to split across; asserted for completeness.
    expect(otherLot!.gainLossEUR).toBe(35.02);

    // The top-level aggregate must reflect the same correct cent: minusvalenze sums the RAW
    // (unrounded) losses across lots and rounds once at the end, so it is exactly where this
    // bug surfaces in the headline fiscal number (feeds Quadro RT/RM).
    expect(report.minusvalenze).toBe(45.87);
    expect(report.plusvalenze).toBe(35.02);
    expect(report.netResult).toBe(-10.85);
  });
});
