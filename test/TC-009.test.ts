import { describe, it, expect } from "vitest";
import { lookupRate } from "../src/rates/index.js";
import { DEGIROParser } from "../src/parser/index.js";

/**
 * TC-009: Exact date ECB lookup returns the rate
 *
 * A trade date that exists in the ECB snapshot uses that rate directly.
 *
 * Steps:
 * 1. lookupRate("USD", "2024-01-02", STUB_RATES) → 1.25
 * 2. Parse a USD 1000 row dated 02-01-2024 → totalEUR = 800.00, fxRate = 1.25
 */

const STUB_RATES = {
  USD: { "2024-01-02": 1.25, "2024-01-05": 1.0941, "2024-06-03": 1.0 },
  GBP: { "2024-01-02": 0.86 },
  CHF: { "2024-01-02": 0.93 },
};

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

// USD 1000 BUY row dated 02-01-2024, ECB rate 1.25 → totalEUR = 800.00
const USD_BUY_ROW =
  "02-01-2024,09:00,Test Stock,US0378331005,XNAS,XNAS,10,100.00,-1000.00,USD,-800.00,EUR,1.25,0.00,EUR,-800.00,EUR,abc-123";

const csv = [HEADER, USD_BUY_ROW].join("\n");

describe("TC-009: Exact date ECB lookup returns the rate", () => {
  it("Step 1: lookupRate returns the exact rate for a matching date", () => {
    const rate = lookupRate("USD", "2024-01-02", STUB_RATES);
    expect(rate).toBe(1.25);
  });

  it("Step 2a: parsing USD row produces exactly one transaction", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
  });

  it("Step 2b: totalEUR = |localValue| / rate = 1000 / 1.25 = 800", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const transactions = parser.parse(csv);
    expect(transactions[0].totalEUR).toBeCloseTo(800.0, 2);
  });

  it("Step 2c: fxRate equals the looked-up rate (1.25)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const transactions = parser.parse(csv);
    expect(transactions[0].fxRate).toBe(1.25);
  });
});
