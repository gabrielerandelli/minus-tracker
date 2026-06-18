import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";

/**
 * TC-008: EUR transaction has fxRate undefined
 *
 * When `Local value currency` is `EUR`, the parsed Transaction must have
 * fxRate=undefined and totalEUR = |totalLocal|.
 *
 * Row: EUR BUY — Local value = -2000.00, Local value currency = EUR,
 *               Transaction costs = -3.00 EUR
 *
 * Row numbering: header = row 1, data row = row 2.
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

// Row 2: EUR BUY — no FX conversion needed
const EUR_BUY_ROW =
  "14-01-2024,09:05,Test Stock,US0378331005,XNAS,XNAS,10,200.00,-2000.00,EUR,-2000.00,EUR,1,-3.00,EUR,-2003.00,EUR,abc-123";

const csv = [HEADER, EUR_BUY_ROW].join("\n");

describe("TC-008: EUR transaction has fxRate undefined", () => {
  it("Step 1: parse returns exactly one transaction", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
  });

  it("Step 2: fxRate is undefined (no FX conversion for EUR transactions)", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions[0].fxRate).toBeUndefined();
  });

  it("Step 3: totalEUR equals |totalLocal| = 2000", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions[0].totalEUR).toBe(2000);
  });

  it("Step 4: feesEUR equals 3", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions[0].feesEUR).toBe(3);
  });
});
