import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";

/**
 * TC-001: Valid DEGIRO CSV produces correct Transaction array
 *
 * Parsing a well-formed Transactions CSV with one BUY and one SELL row
 * returns a Transaction[] with all fields mapped correctly.
 */
describe("TC-001: Valid DEGIRO CSV → correct Transaction[]", () => {
  const csv = [
    "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID",
    "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123",
    "15-03-2024,14:20,Apple Inc,US0378331005,XNAS,XNAS,-10,180.00,1800.00,EUR,1800.00,EUR,1,-2.00,EUR,1798.00,EUR,abc-456",
  ].join("\n");

  it("Step 1: returns Transaction[] of length 2", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(2);
  });

  it("Step 2: transactions[0] is a correctly-mapped BUY", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const buy = transactions[0];

    expect(buy.type).toBe("BUY");
    expect(buy.quantity).toBe(10);
    expect(buy.isin).toBe("US0378331005");
    expect(buy.date).toBe("2024-01-14");
    expect(buy.totalLocal).toBe(-1500);
    expect(buy.feesEUR).toBe(2);
    expect(buy.fxRate).toBeUndefined();
  });

  it("Step 3: transactions[1] is a correctly-mapped SELL", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);
    const sell = transactions[1];

    expect(sell.type).toBe("SELL");
    expect(sell.quantity).toBe(10);
    expect(sell.totalLocal).toBe(1800);
    expect(sell.feesEUR).toBe(2);
    expect(sell.fxRate).toBeUndefined();
  });

  it("Step 4: totalEUR is correct for EUR-denominated rows (|totalLocal| / 1.0)", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);

    // EUR → EUR: totalEUR = |totalLocal|
    expect(transactions[0].totalEUR).toBe(1500);
    expect(transactions[1].totalEUR).toBe(1800);
  });

  it("dates are converted from DD-MM-YYYY to YYYY-MM-DD", () => {
    const parser = new DEGIROParser();
    const transactions = parser.parse(csv);

    expect(transactions[0].date).toBe("2024-01-14");
    expect(transactions[1].date).toBe("2024-03-15");
  });

  it("EUR rows produce no warnings", () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.warnings).toHaveLength(0);
  });
});
