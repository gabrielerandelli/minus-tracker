import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { ParseError } from "../src/errors.js";

/**
 * TC-123: non-null-byte binary garbage → INVALID_CSV, not MISSING_COLUMN
 *
 * Reproduces HU-02: a file of random binary bytes with NO NUL byte (so the
 * pre-existing \x00 check doesn't catch it) used to fall through to normal
 * column-matching and produce a misleading "missing required column: ISIN"
 * error instead of "invalid CSV". A control-character-density heuristic on
 * the header-row candidate now catches this case too.
 */
describe("TC-123: non-null-byte binary garbage → INVALID_CSV", () => {
  // Deliberately dense with control chars (\x01-\x1F, excluding \x09 tab),
  // no \x00 anywhere — this previously slipped past the null-byte check.
  const binaryGarbageNoNullByte =
    "\x01\x02\x03\x04\x05\x06\x07\x0b\x0c\x0e\x0f\x10\x11\x12,\x13\x14\x15\x16\n" +
    "more garbage row";

  it("contains no NUL byte (sanity check on the fixture itself)", () => {
    expect(binaryGarbageNoNullByte.includes("\x00")).toBe(false);
  });

  it("throws ParseError with code INVALID_CSV, not MISSING_COLUMN", () => {
    const parser = new DEGIROParser();
    try {
      parser.parse(binaryGarbageNoNullByte);
      throw new Error("Expected ParseError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).code).toBe("INVALID_CSV");
    }
  });

  it("does not misfire on legitimate accented product names (Italian text)", () => {
    const legit =
      "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID\n" +
      "02-01-2024,10:00,Società Générale Perpétuité,FR0000000001,XPAR,XPAR,10,50.00,-500.00,EUR,-500.00,EUR,1,-1.00,EUR,-501.00,EUR,s1\n";
    const parser = new DEGIROParser();
    expect(() => parser.parse(legit)).not.toThrow();
  });
});
