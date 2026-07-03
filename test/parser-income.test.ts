import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../src/parser/index.js";

/**
 * Category 13 — Parser: Income Row Parsing (v0.7.0)
 *
 * Covers TC-073, TC-074, TC-075, TC-077, TC-078, TC-079, TC-080 from
 * docs/test_plan/11-parser-income-rows.md.
 *
 * Row numbering: header = row 1, first data row = row 2.
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

describe("TC-073: DEGIROParser.incomeRows — dividend row produces IncomeRow", () => {
  // BUY row and the DIVIDEND row both use USD; stub provides rates for both dates
  // so the BUY transaction parses without warnings and the dividend row's FX
  // conversion uses the documented 2024-06-03 rate.
  const STUB_RATES = { USD: { "2024-01-14": 1.25, "2024-06-03": 1.25 } };

  const BUY_ROW =
    "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,USD,-1500.00,USD,1,-2.00,USD,-1502.00,USD,abc-123";
  const DIVIDEND_ROW =
    "03-06-2024,00:00,DIVIDEND Apple Inc,US0378331005,,,0,,35.00,USD,35.00,USD,1,0.00,USD,35.00,USD,";

  const csv = [HEADER, BUY_ROW, DIVIDEND_ROW].join("\n");

  it("Step 1: returns Transaction[] of length 1 (BUY only)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    const transactions = parser.parse(csv);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe("BUY");
  });

  it("Step 2: incomeRows.length is 1", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(1);
  });

  it("Step 3: incomeType is 'dividend'", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.incomeRows[0].incomeType).toBe("dividend");
  });

  it("Step 4: isin is US0378331005", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.incomeRows[0].isin).toBe("US0378331005");
  });

  it("Step 5: grossAmount is 28.00 (35.00 / 1.25)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.incomeRows[0].grossAmount).toBeCloseTo(28.0, 6);
  });

  it("Step 6: withholdingTax is 0 (no withholding row)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.incomeRows[0].withholdingTax).toBe(0);
  });

  it("Step 7: fxRate is 1.25", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.incomeRows[0].fxRate).toBe(1.25);
  });

  it("Step 8: parser.warnings is empty", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.warnings).toEqual([]);
  });
});

describe("TC-074: DEGIROParser.incomeRows — coupon row produces IncomeRow", () => {
  const makeCSV = (product: string, isin: string) =>
    [
      HEADER,
      `01-04-2024,00:00,${product},${isin},,,0,,120.00,EUR,120.00,EUR,1,0.00,EUR,120.00,EUR,`,
    ].join("\n");

  it("Step 1: COUPON product → incomeType 'coupon'", () => {
    const parser = new DEGIROParser();
    parser.parse(makeCSV("COUPON BTP 2028", "IT0001278511"));
    expect(parser.incomeRows[0].incomeType).toBe("coupon");
  });

  it("Step 2: CEDOLA product → incomeType 'coupon'", () => {
    const parser = new DEGIROParser();
    parser.parse(makeCSV("CEDOLA BTP 2030", "IT0001086567"));
    expect(parser.incomeRows[0].incomeType).toBe("coupon");
  });

  it("Step 3: INTEREST product → incomeType 'coupon'", () => {
    const parser = new DEGIROParser();
    parser.parse(makeCSV("INTEREST PAYMENT", "IT0001278511"));
    expect(parser.incomeRows[0].incomeType).toBe("coupon");
  });

  it("Step 4: all grossAmounts are 120.00 (EUR, no FX conversion)", () => {
    for (const [product, isin] of [
      ["COUPON BTP 2028", "IT0001278511"],
      ["CEDOLA BTP 2030", "IT0001086567"],
      ["INTEREST PAYMENT", "IT0001278511"],
    ]) {
      const parser = new DEGIROParser();
      parser.parse(makeCSV(product, isin));
      expect(parser.incomeRows[0].grossAmount).toBe(120.0);
    }
  });

  it("Step 5: all withholdingTax are 0 (no withholding row present)", () => {
    for (const [product, isin] of [
      ["COUPON BTP 2028", "IT0001278511"],
      ["CEDOLA BTP 2030", "IT0001086567"],
      ["INTEREST PAYMENT", "IT0001278511"],
    ]) {
      const parser = new DEGIROParser();
      parser.parse(makeCSV(product, isin));
      expect(parser.incomeRows[0].withholdingTax).toBe(0);
    }
  });

  it("Step 6: all fxRate are undefined (EUR rows)", () => {
    for (const [product, isin] of [
      ["COUPON BTP 2028", "IT0001278511"],
      ["CEDOLA BTP 2030", "IT0001086567"],
      ["INTEREST PAYMENT", "IT0001278511"],
    ]) {
      const parser = new DEGIROParser();
      parser.parse(makeCSV(product, isin));
      expect(parser.incomeRows[0].fxRate).toBeUndefined();
    }
  });
});

describe("TC-075: Withholding row paired with dividend row by (ISIN, date) — order-independent", () => {
  // Withholding row appears BEFORE the dividend row in the CSV — pairing must
  // not rely on CSV row order.
  const WITHHOLDING_ROW =
    "03-06-2024,00:00,DIVIDEND TAX Apple Inc,US0378331005,,,0,,-5.25,EUR,-5.25,EUR,1,0.00,EUR,-5.25,EUR,";
  const DIVIDEND_ROW =
    "03-06-2024,00:00,DIVIDEND Apple Inc,US0378331005,,,0,,35.00,EUR,35.00,EUR,1,0.00,EUR,35.00,EUR,";

  const csv = [HEADER, WITHHOLDING_ROW, DIVIDEND_ROW].join("\n");

  it("Step 1: parse does not throw", () => {
    const parser = new DEGIROParser();
    expect(() => parser.parse(csv)).not.toThrow();
  });

  it("Step 2: incomeRows.length is 1 (withholding row consumed by pair)", () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(1);
  });

  it("Step 3: grossAmount is 35.00", () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.incomeRows[0].grossAmount).toBe(35.0);
  });

  it("Step 4: withholdingTax is 5.25", () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.incomeRows[0].withholdingTax).toBe(5.25);
  });

  it("Step 5: parser.warnings is empty (pairing succeeded)", () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.warnings).toEqual([]);
  });
});

describe("TC-077: Non-EUR income row → grossAmount converted via ECB rate", () => {
  const STUB_RATES = { USD: { "2024-01-02": 1.25 } };
  const DIVIDEND_ROW =
    "02-01-2024,00:00,DIVIDEND Apple Inc,US0378331005,,,0,,35.00,USD,35.00,USD,1,0.00,USD,35.00,USD,";
  const csv = [HEADER, DIVIDEND_ROW].join("\n");

  it("Step 1: incomeRows.length is 1", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(1);
  });

  it("Step 2: grossAmount is 28.00 (35.00 / 1.25)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.incomeRows[0].grossAmount).toBeCloseTo(28.0, 6);
  });

  it("Step 3: currency is 'USD'", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.incomeRows[0].currency).toBe("USD");
  });

  it("Step 4: fxRate is 1.25", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.incomeRows[0].fxRate).toBe(1.25);
  });
});

describe("TC-078: Non-EUR income row with no ECB rate within 3 days → skipped with NO_ECB_RATE warning", () => {
  // Stub snapshot has a USD entry, but not for 2024-02-14 or the 3 preceding days.
  const STUB_RATES = { USD: { "2024-06-03": 1.25 } };
  const DIVIDEND_ROW =
    "14-02-2024,00:00,DIVIDEND Apple Inc,US0378331005,,,0,,35.00,USD,35.00,USD,1,0.00,USD,35.00,USD,";
  const csv = [HEADER, DIVIDEND_ROW].join("\n");

  it("Step 1: parse does not throw", () => {
    const parser = new DEGIROParser(STUB_RATES);
    expect(() => parser.parse(csv)).not.toThrow();
  });

  it("Step 2: incomeRows is empty (row skipped)", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(parser.incomeRows).toEqual([]);
  });

  it("Step 3: warnings contains a NO_ECB_RATE-style warning mentioning USD and 2024-02-14", () => {
    const parser = new DEGIROParser(STUB_RATES);
    parser.parse(csv);
    expect(
      parser.warnings.some(
        (w) => w.includes("USD") && w.includes("2024-02-14"),
      ),
    ).toBe(true);
  });
});

describe("TC-079: Blank ISIN on income-type row → skipped with warning", () => {
  const DIVIDEND_ROW =
    "01-05-2024,00:00,DIVIDEND GENERIC,,,,0,,50.00,EUR,50.00,EUR,1,0.00,EUR,50.00,EUR,";
  const csv = [HEADER, DIVIDEND_ROW].join("\n");

  it("Step 1: parse does not throw", () => {
    const parser = new DEGIROParser();
    expect(() => parser.parse(csv)).not.toThrow();
  });

  it("Step 2: incomeRows is empty (blank-ISIN row excluded)", () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.incomeRows).toEqual([]);
  });

  it("Step 3: warnings contains a warning mentioning blank ISIN on income row", () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.warnings.some((w) => w.includes("blank ISIN"))).toBe(true);
  });
});

describe("TC-080: Withholding candidate with no matching income row → skipped with warning", () => {
  const WITHHOLDING_ROW =
    "01-05-2024,00:00,DIVIDEND TAX XS,XS0000000001,,,0,,-7.00,EUR,-7.00,EUR,1,0.00,EUR,-7.00,EUR,";
  const csv = [HEADER, WITHHOLDING_ROW].join("\n");

  it("Step 1: parse does not throw", () => {
    const parser = new DEGIROParser();
    expect(() => parser.parse(csv)).not.toThrow();
  });

  it("Step 2: incomeRows is empty (orphan withholding has no income counterpart)", () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.incomeRows).toEqual([]);
  });

  it("Step 3: warnings references the orphan withholding on XS0000000001/2024-05-01", () => {
    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(
      parser.warnings.some(
        (w) => w.includes("XS0000000001") && w.includes("2024-05-01"),
      ),
    ).toBe(true);
  });
});
