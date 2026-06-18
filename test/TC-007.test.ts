import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";

/**
 * TC-007: Soft warning — quantity = 0 row is skipped
 *
 * A CSV row where Quantity is 0 must be silently skipped (no throw).
 * The parser emits a QUANTITY_ZERO warning for that row.
 *
 * Row numbering: header = row 1, data row = row 2.
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

// Row 2: Quantity = 0 — must be skipped
const ZERO_QTY_ROW =
  "14-01-2024,09:05,Test Stock,US0378331005,XNAS,XNAS,0,150.00,0.00,EUR,0.00,EUR,1,0.00,EUR,0.00,EUR,abc-123";

const csv = [HEADER, ZERO_QTY_ROW].join("\n");

describe("TC-007: Soft warning — quantity = 0 row is skipped", () => {
  it("Step 1: parse does not throw", () => {
    const parser = new DEGIROParser();
    expect(() => parser.parse(csv)).not.toThrow();
  });

  it("Step 2: returned array is empty (length 0)", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
  });

  it('Step 3: parser.warnings contains "Row 2: quantity is 0 — skipped"', () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.warnings).toContain("Row 2: quantity is 0 — skipped");
  });
});
