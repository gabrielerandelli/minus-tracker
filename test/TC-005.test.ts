import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";

/**
 * TC-005: Soft warning — unsupported currency row is skipped
 *
 * A row with a `Local value currency` not in the ECB snapshot (e.g., JPY) is
 * skipped without throwing, and parser.warnings contains a message referencing
 * the row number and currency code.
 *
 * Stub rates contain only USD, GBP, CHF — JPY is intentionally absent.
 */

const STUB_RATES = {
  USD: { "2024-01-02": 1.25, "2024-01-05": 1.0941, "2024-06-03": 1.0 },
  GBP: { "2024-01-02": 0.86 },
  CHF: { "2024-01-02": 0.93 },
};

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

// Row 2: valid EUR BUY — should be parsed successfully
const VALID_ROW =
  "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";

// Row 3: JPY currency not present in stub snapshot — should be skipped
const JPY_ROW =
  "02-01-2024,10:00,Toyota Motor,JP3633400001,XTKS,XTKS,5,2000.00,-10000.00,JPY,-10000.00,JPY,1,-100.00,JPY,-10100.00,JPY,xyz-789";

const csv = [HEADER, VALID_ROW, JPY_ROW].join("\n");

describe("TC-005: Soft warning — unsupported currency row is skipped", () => {
  it("Step 1: parse does not throw", () => {
    const parser = new DEGIROParser(STUB_RATES);
    expect(() => parser.parse(csv)).not.toThrow();
  });

  it("Step 2: returned array skips the JPY row (length 1)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    // Confirm the surviving row is the EUR one
    expect(transactions[0].isin).toBe("US0378331005");
  });

  it('Step 3: parser.warnings contains "Row 3: unsupported currency JPY — skipped"', () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.warnings).toContain(
      "Row 3: unsupported currency JPY — skipped",
    );
  });
});
