import { describe, it, expect } from "vitest";
import { lookupRate } from "../src/rates/index.js";
import { DEGIROParser } from "../src/parser/index.js";

/**
 * TC-011: 3-day lookback exhausted → warning + row skipped
 *
 * When neither the trade date (2024-02-14) nor the 3 prior days
 * (2024-02-13, 2024-02-12, 2024-02-11) have a USD rate, the row is
 * skipped and a warning is emitted.
 *
 * Steps:
 * 1. lookupRate("USD", "2024-02-14", STUB_RATES) → null
 * 2. Parse a USD row dated 14-02-2024 → row skipped (no throw), empty array
 * 3. parser.warnings → contains "Row 2: no ECB rate for USD on 2024-02-14 — skipped"
 */

const STUB_RATES = {
  USD: { "2024-01-02": 1.25, "2024-01-05": 1.0941, "2024-06-03": 1.0 },
  GBP: { "2024-01-02": 0.86 },
  CHF: { "2024-01-02": 0.93 },
};

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

// USD BUY row dated 14-02-2024; no ECB rate in stub for this date or prior 3 days
const USD_ROW =
  "14-02-2024,09:00,Test Stock,US0378331005,XNAS,XNAS,10,100.00,-1000.00,USD,-1000.00,USD,1,0.00,EUR,0.00,EUR,abc-123";

const csv = [HEADER, USD_ROW].join("\n");

describe("TC-011: 3-day lookback exhausted → warning + row skipped", () => {
  it("Step 1: lookupRate returns null when no rate exists within 3-day window", () => {
    const rate = lookupRate("USD", "2024-02-14", STUB_RATES);
    expect(rate).toBeNull();
  });

  it("Step 2: parsing a USD row with no ECB rate returns empty array (no throw)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(0);
  });

  it("Step 3: parser.warnings contains the expected NO_ECB_RATE message", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.warnings).toContain(
      "Row 2: no ECB rate for USD on 2024-02-14 — skipped",
    );
  });
});
