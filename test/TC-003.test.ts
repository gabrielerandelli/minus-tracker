import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { ParseError } from "../src/errors.js";

/**
 * TC-003: ParseError on missing required column
 *
 * A CSV missing a required column header throws ParseError with code MISSING_COLUMN
 * and the columnName property set to the missing column name.
 */

// Full valid header for reference
const FULL_HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

const DATA_ROW =
  "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";

/**
 * Build a CSV string with the specified column removed from the header row.
 */
function csvMissingColumn(columnName: string): string {
  const cols = FULL_HEADER.split(",");
  const filtered = cols.filter((c) => c !== columnName);
  return [filtered.join(","), DATA_ROW].join("\n");
}

describe("TC-003: ParseError on missing required column", () => {
  const requiredColumns = [
    "ISIN",
    "Quantity",
    "Price",
    "Date",
    "Local value",
    "Local value currency",
    "Transaction costs",
    "Transaction costs currency",
    "Product",
  ];

  for (const col of requiredColumns) {
    describe(`missing column: "${col}"`, () => {
      it("Step 1: throws ParseError", () => {
        const parser = new DEGIROParser();
        expect(() => parser.parse(csvMissingColumn(col))).toThrow(ParseError);
      });

      it("Step 2: err.code is MISSING_COLUMN", () => {
        const parser = new DEGIROParser();
        try {
          parser.parse(csvMissingColumn(col));
          throw new Error("Expected ParseError to be thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(ParseError);
          expect((err as ParseError).code).toBe("MISSING_COLUMN");
        }
      });

      it(`Step 3: err.columnName is "${col}"`, () => {
        const parser = new DEGIROParser();
        try {
          parser.parse(csvMissingColumn(col));
          throw new Error("Expected ParseError to be thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(ParseError);
          expect((err as ParseError).columnName).toBe(col);
        }
      });

      it(`Step 4: err.message is "Missing required column: ${col}"`, () => {
        const parser = new DEGIROParser();
        try {
          parser.parse(csvMissingColumn(col));
          throw new Error("Expected ParseError to be thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(ParseError);
          expect((err as ParseError).message).toBe(
            `Missing required column: ${col}`,
          );
        }
      });
    });
  }
});
