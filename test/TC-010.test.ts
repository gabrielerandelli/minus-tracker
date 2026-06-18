import { describe, it, expect } from "vitest";
import { lookupRate } from "../src/rates/index.js";
import { DEGIROParser } from "../src/parser/index.js";

/**
 * TC-010: Weekend fallback — walks back up to 3 calendar days
 *
 * A trade on 2024-01-07 (Sunday) falls back to 2024-01-05 (Friday, stub rate: 1.0941).
 * No warning is emitted — weekend fallback is transparent.
 *
 * Steps:
 * 1. lookupRate("USD", "2024-01-07", STUB_RATES) → 1.0941 (walkback: 07→06→05)
 * 2. Parse a USD 1094.10 row dated 07-01-2024 (Sunday) → transaction returned, no warnings
 * 3. fxRate → 1.0941
 * 4. totalEUR ≈ 1094.10 / 1.0941 ≈ 1000.00 (within 0.01 tolerance)
 */

const STUB_RATES = {
  USD: { "2024-01-02": 1.25, "2024-01-05": 1.0941, "2024-06-03": 1.0 },
  GBP: { "2024-01-02": 0.86 },
  CHF: { "2024-01-02": 0.93 },
};

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

// USD 1094.10 BUY row dated 07-01-2024 (Sunday), ECB rate on fallback Friday 2024-01-05: 1.0941
// totalEUR = 1094.10 / 1.0941 ≈ 1000.00
const USD_SUNDAY_ROW =
  "07-01-2024,09:00,Test Stock,US0378331005,XNAS,XNAS,10,109.41,-1094.10,USD,-1000.00,EUR,1.0941,0.00,EUR,-1000.00,EUR,abc-123";

const csv = [HEADER, USD_SUNDAY_ROW].join("\n");

describe("TC-010: Weekend fallback — walks back up to 3 calendar days", () => {
  it("Step 1: lookupRate walks back from Sunday 2024-01-07 to Friday 2024-01-05, returning 1.0941", () => {
    const rate = lookupRate("USD", "2024-01-07", STUB_RATES);
    expect(rate).toBe(1.0941);
  });

  it("Step 2a: parsing Sunday-dated USD row produces exactly one transaction (no warning)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(parser.warnings).toHaveLength(0);
  });

  it("Step 3: fxRate equals the fallback Friday rate (1.0941)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const transactions = parser.parse(csv);
    expect(transactions[0].fxRate).toBe(1.0941);
  });

  it("Step 4: totalEUR ≈ 1094.10 / 1.0941 ≈ 1000.00 (within 0.1 tolerance)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const transactions = parser.parse(csv);
    expect(transactions[0].totalEUR).toBeCloseTo(1000, 1);
  });
});
