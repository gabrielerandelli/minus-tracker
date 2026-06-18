import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { ParseError } from "../src/errors.js";

/**
 * TC-002: ParseError on invalid CSV content
 *
 * A file that is not valid CSV structure throws ParseError with code INVALID_CSV.
 */
describe("TC-002: ParseError on invalid CSV content", () => {
  const binaryGarbage = "Field1\x00\x01Field2\nbinary garbage...";

  it("Step 1: throws ParseError when given binary/garbage content", () => {
    const parser = new DEGIROParser();
    expect(() => parser.parse(binaryGarbage)).toThrow(ParseError);
  });

  it("Step 2: err.code is INVALID_CSV", () => {
    const parser = new DEGIROParser();
    try {
      parser.parse(binaryGarbage);
      throw new Error("Expected ParseError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).code).toBe("INVALID_CSV");
    }
  });

  it("Step 3: err.message is 'Invalid CSV: unable to parse'", () => {
    const parser = new DEGIROParser();
    try {
      parser.parse(binaryGarbage);
      throw new Error("Expected ParseError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).message).toBe("Invalid CSV: unable to parse");
    }
  });
});
