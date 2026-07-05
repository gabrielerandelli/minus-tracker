import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";
import { Calculator } from "../src/calculator/index.js";
import { ParseError, CalculationError } from "../src/errors.js";
import type { Transaction } from "../src/types.js";

/**
 * TC-104: ParseError.code/columnName and CalculationError.isin/date are populated
 *
 * v0.8.0 promotes ParseError and CalculationError from bare Error subclasses to
 * structured errors with machine-readable fields, consumed directly by the MCP
 * error mapping (Part 15). This verifies the existing fields on both classes.
 */

// Full valid header for reference (mirrors TC-003)
const FULL_HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

const DATA_ROW =
  "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";

function csvMissingColumn(columnName: string): string {
  const cols = FULL_HEADER.split(",");
  const filtered = cols.filter((c) => c !== columnName);
  return [filtered.join(","), DATA_ROW].join("\n");
}

describe("TC-104: ParseError.code/columnName and CalculationError.isin/date are populated", () => {
  describe("Step 1: missing-column ParseError", () => {
    it("throws ParseError with code MISSING_COLUMN and columnName 'ISIN'", () => {
      const parser = new DEGIROParser();
      try {
        parser.parse(csvMissingColumn("ISIN"));
        throw new Error("Expected ParseError to be thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError);
        expect((err as ParseError).code).toBe("MISSING_COLUMN");
        expect((err as ParseError).columnName).toBe("ISIN");
      }
    });
  });

  describe("Step 2: invalid-CSV ParseError", () => {
    it("throws ParseError with code INVALID_CSV and columnName undefined", () => {
      const parser = new DEGIROParser();
      const binaryGarbage = "Field1\x00\x01Field2\nbinary garbage...";
      try {
        parser.parse(binaryGarbage);
        throw new Error("Expected ParseError to be thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError);
        expect((err as ParseError).code).toBe("INVALID_CSV");
        expect((err as ParseError).columnName).toBeUndefined();
      }
    });
  });

  describe("Step 3: unmatched-SELL CalculationError", () => {
    const sell: Transaction = {
      isin: "ISIN_NO_LOTS",
      product: "Test",
      date: "2024-06-03",
      type: "SELL",
      quantity: 5,
      pricePerUnit: 100,
      currency: "EUR",
      totalLocal: 500,
      totalEUR: 500,
      feesEUR: 0,
      fxRate: undefined,
    };

    it("throws CalculationError with isin and date matching the SELL", () => {
      try {
        new Calculator([sell]).calculateGains("LIFO");
        throw new Error("Expected CalculationError but no error was thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(CalculationError);
        expect((err as CalculationError).isin).toBe("ISIN_NO_LOTS");
        expect((err as CalculationError).date).toBe("2024-06-03");
      }
    });
  });
});
