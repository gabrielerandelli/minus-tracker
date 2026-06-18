import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";

/**
 * TC-023 (AE-12): ECB weekend fallback used in calculation
 *
 * A Sunday-dated (2024-01-07) USD transaction must use the Friday (2024-01-05)
 * fallback rate (1.0941) with NO warning emitted.
 *
 * The stub snapshot has no entry for 2024-01-06 (Sat) or 2024-01-07 (Sun),
 * but does have 2024-01-05 (Fri) at 1.0941. lookupRate walks back up to 3
 * calendar days, so Sun → Sat → Fri (found).
 *
 * BUY: 2024-01-07 — 10 units @ 109.41 USD, totalLocal = -1094.10 USD
 * Expected fxRate:  1.0941 (Friday fallback)
 * Expected totalEUR ≈ 1000.00 (|totalLocal| / fxRate = 1094.10 / 1.0941)
 */

const STUB_RATES = {
  USD: { "2024-01-02": 1.25, "2024-01-05": 1.0941, "2024-06-03": 1.0 },
  GBP: { "2024-01-02": 0.86 },
  CHF: { "2024-01-02": 0.93 },
};

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

// Sunday 2024-01-07 — no ECB rate exists for this date or Saturday 2024-01-06
const SUNDAY_ROW =
  "07-01-2024,09:00,Test Stock,US0378331005,XNAS,XNAS,10,109.41,-1094.10,USD,-1000.00,EUR,1.0941,0.00,EUR,-1000.00,EUR,abc-123";

const csv = [HEADER, SUNDAY_ROW].join("\n");

describe("TC-023 (AE-12): ECB weekend fallback used in calculation", () => {
  it("Step 1: parse does not throw", () => {
    const parser = new DEGIROParser(STUB_RATES);
    expect(() => parser.parse(csv)).not.toThrow();
  });

  it("Step 2: no warnings are emitted (fallback is silent)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.warnings).toHaveLength(0);
  });

  it("Step 3: one transaction is returned", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
  });

  it("Step 4: tx.fxRate === 1.0941 (Friday fallback rate)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const [tx] = parser.parse(csv);
    expect(tx.fxRate).toBe(1.0941);
  });

  it("Step 5: tx.totalEUR ≈ 1000.00 (|totalLocal| / fallback rate)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const [tx] = parser.parse(csv);
    expect(tx.totalEUR).toBeCloseTo(1000, 1);
  });

  it("Step 6: tx.date is the original Sunday date '2024-01-07'", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const [tx] = parser.parse(csv);
    expect(tx.date).toBe("2024-01-07");
  });
});
