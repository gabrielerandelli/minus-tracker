import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";

/**
 * TC-006: Soft warning — no ECB rate found within 3-day lookback
 *
 * A row whose trade date has no ECB rate on that day, the previous day, or
 * the two days before that (4 consecutive missing days) is skipped with a warning.
 *
 * Stub rates have USD entries only for 2024-01-02, 2024-01-05, and 2024-06-03.
 * The date 2024-02-10 and the 3 days before it (2024-02-09, 2024-02-08, 2024-02-07)
 * are all absent from the stub, so the 3-day lookback is exhausted.
 *
 * Row numbering: header = row 1, first data row = row 2, second data row = row 3.
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

// Row 3: USD transaction on 2024-02-10 — no ECB rate within 3-day lookback in stub
const NO_RATE_ROW =
  "10-02-2024,10:00,Microsoft Corp,US5949181045,XNAS,XNAS,5,300.00,-1500.00,USD,-1500.00,USD,1.08,-2.00,USD,-1502.00,USD,def-789";

const csv = [HEADER, VALID_ROW, NO_RATE_ROW].join("\n");

describe("TC-006: Soft warning — no ECB rate found within 3-day lookback", () => {
  it("Step 1: parse does not throw", () => {
    const parser = new DEGIROParser(STUB_RATES);
    expect(() => parser.parse(csv)).not.toThrow();
  });

  it("Step 2: returned array skips the no-rate row (length 1)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    // Confirm the surviving row is the EUR one
    expect(transactions[0].isin).toBe("US0378331005");
  });

  it('Step 3: parser.warnings contains "Row 3: no ECB rate for USD on 2024-02-10 — skipped"', () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.warnings).toContain(
      "Row 3: no ECB rate for USD on 2024-02-10 — skipped",
    );
  });
});
