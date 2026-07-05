import { describe, it, expect } from "vitest";
import { handleCalculateGains } from "../../src/mcp/tools/calculate-gains.js";
import type {
  ClassificationMap,
  IncomeRow,
  Transaction,
} from "../../src/types.js";

/**
 * Recursively checks that no object in the given value tree has an
 * "exportTo" own-property key.
 */
function hasExportToKeyAnywhere(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasExportToKeyAnywhere);
  const obj = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(obj, "exportTo")) return true;
  return Object.values(obj).some(hasExportToKeyAnywhere);
}

const ETF_ISIN = "IE00B4L5Y983";
const STOCK_ISIN = "US0378331005";

const CLASSIFICATION: ClassificationMap = {
  [ETF_ISIN]: {
    product: "iShares MSCI World",
    assetClass: "ETF",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
    confirmedByUser: true,
    source: "openfigi",
  },
  [STOCK_ISIN]: {
    product: "Apple Inc",
    assetClass: "Stock",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
    confirmedByUser: true,
    source: "openfigi",
  },
};

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    isin: STOCK_ISIN,
    product: "Apple Inc",
    date: "2024-01-10",
    type: "BUY",
    quantity: 1,
    pricePerUnit: 100,
    currency: "EUR",
    totalLocal: -100,
    totalEUR: 100,
    feesEUR: 0,
    fxRate: undefined,
    ...overrides,
  };
}

describe("TC-113: calculate_gains — full pipeline output includes bucketA/B/dichiarazione; exportTo omitted", () => {
  it("computes bucketA, bucketB, and dichiarazione matching the mixed ETF/Stock fixture", async () => {
    const etfBuy = makeTransaction({
      isin: ETF_ISIN,
      product: "iShares MSCI World",
      date: "2024-01-10",
      type: "BUY",
      quantity: 10,
      totalLocal: -1000,
      totalEUR: 1000,
    });
    const etfSell = makeTransaction({
      isin: ETF_ISIN,
      product: "iShares MSCI World",
      date: "2024-06-10",
      type: "SELL",
      quantity: 10,
      totalLocal: 1400,
      totalEUR: 1400,
    });
    const stockBuy = makeTransaction({
      isin: STOCK_ISIN,
      date: "2024-01-10",
      type: "BUY",
      quantity: 10,
      totalLocal: -1000,
      totalEUR: 1000,
    });
    const stockSell = makeTransaction({
      isin: STOCK_ISIN,
      date: "2024-06-10",
      type: "SELL",
      quantity: 10,
      totalLocal: 700,
      totalEUR: 700,
    });

    const dividend: IncomeRow = {
      isin: STOCK_ISIN,
      product: "Apple Inc",
      date: "2024-07-01",
      incomeType: "dividend",
      grossAmount: 40,
      withholdingTax: 6,
      currency: "EUR",
    };

    const result = await handleCalculateGains({
      transactions: [etfBuy, etfSell, stockBuy, stockSell],
      method: "LIFO",
      classification: CLASSIFICATION,
      incomeRows: [dividend],
      carryForward: [{ year: 2023, amount: 100 }],
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.bucketA).toEqual({
      groups: [
        {
          taxRate: 0.26,
          assetClasses: ["ETF"],
          plusvalenze: 400,
          imposta: 104,
        },
      ],
      totalImposta: 104,
    });

    expect(parsed.bucketB).toEqual({
      plusvalenze: 0,
      minusvalenze: 300,
      carryForwardApplied: 0,
      carryForwardRemaining: 300,
      carryForwardEntriesRemaining: [{ annoOrigine: 2023, importo: 100 }],
      netResult: -300,
    });

    expect(parsed.dichiarazione.annoImposta).toBe(2024);
    expect(parsed.dichiarazione.quadroRT).toEqual({
      plusvalenze: 0,
      minusvalenze: 300,
      differenza: -300,
      carryForwardApplied: [],
      imponibileNetto: 0,
      imposta: 0,
      carryForwardRiportato: [{ annoOrigine: 2024, importo: 300 }],
    });
    expect(parsed.dichiarazione.quadroRM.capitaleAliquota26).toEqual({
      plusvalenze: 400,
      imposta: 104,
    });
    expect(parsed.dichiarazione.quadroRM.capitaleAliquota125).toEqual({
      plusvalenze: 0,
      imposta: 0,
    });
    expect(parsed.dichiarazione.quadroRM.dividendiEsteri).toEqual([
      {
        isin: STOCK_ISIN,
        prodotto: "Apple Inc",
        lordo: 40,
        rittenutaEstera: 6,
      },
    ]);
    expect(parsed.dichiarazione.quadroRM.cedole).toEqual([]);

    // exportTo is a function property; JSON.stringify drops it automatically.
    expect(hasExportToKeyAnywhere(parsed)).toBe(false);
  });
});

describe("TC-114: calculate_gains — CalculationError mapped to isError with isin/date/message", () => {
  it("returns isError:true with CALCULATION_ERROR code and the offending isin/date", async () => {
    const sell: Transaction = {
      isin: "ISIN_NO_LOTS",
      product: "Test",
      date: "2024-06-03",
      type: "SELL",
      quantity: 5,
      pricePerUnit: 100,
      currency: "EUR",
      totalLocal: 500,
      totalEUR: 500,
      feesEUR: 0,
      fxRate: undefined,
    };

    const result = await handleCalculateGains({
      transactions: [sell],
      method: "LIFO",
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe("CALCULATION_ERROR");
    expect(parsed.isin).toBe("ISIN_NO_LOTS");
    expect(parsed.date).toBe("2024-06-03");
    expect(typeof parsed.message).toBe("string");
  });
});
