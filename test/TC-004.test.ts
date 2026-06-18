import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";

/**
 * TC-004: Soft warning — row with missing ISIN is skipped
 *
 * A data row with an empty ISIN cell is skipped with a warning; other rows
 * are still parsed. Row numbering is 1-indexed (header = row 1, first data
 * row = row 2, second data row = row 3).
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

// Row 2: valid BUY row with a proper ISIN
const VALID_ROW =
  "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";

// Row 3: same structure but ISIN field is empty
const MISSING_ISIN_ROW =
  "15-03-2024,14:20,Apple Inc,,XNAS,XNAS,-10,180.00,1800.00,EUR,1800.00,EUR,1,-2.00,EUR,1798.00,EUR,abc-456";

const csv = [HEADER, VALID_ROW, MISSING_ISIN_ROW].join("\n");

describe("TC-004: Soft warning — row with missing ISIN is skipped", () => {
  it("Step 1: parse does not throw", () => {
    const parser = new DEGIROParser();
    expect(() => parser.parse(csv)).not.toThrow();
  });

  it("Step 2: returned array has length 1 (only the valid row)", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
  });

  it('Step 3: parser.warnings contains "Row 3: missing ISIN — skipped"', () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.warnings).toContain("Row 3: missing ISIN — skipped");
  });
});
