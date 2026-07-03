import { describe, it, expect } from "vitest";
import { buildQuadroRT, buildQuadroRM } from "../src/dichiarazione/engine.js";
import { Calculator } from "../src/calculator/index.js";
import type {
  BucketAReport,
  BucketBReport,
  CarryForward,
  ClassificationMap,
  IncomeRow,
  Transaction,
} from "../src/types.js";

function makeBucketB(plusvalenze: number, minusvalenze: number): BucketBReport {
  return {
    plusvalenze,
    minusvalenze,
    carryForwardApplied: 0,
    carryForwardRemaining: 0,
    netResult: plusvalenze - minusvalenze,
  };
}

describe("TC-081 (TC-D1): net gain, no carry-forward", () => {
  it("computes differenza=800, imposta=208, no CF applied or carried", () => {
    const result = buildQuadroRT(makeBucketB(1000, 200), [], 2024);
    expect(result.plusvalenze).toBe(1000);
    expect(result.minusvalenze).toBe(200);
    expect(result.differenza).toBe(800);
    expect(result.carryForwardApplied).toEqual([]);
    expect(result.imponibileNetto).toBe(800);
    expect(result.imposta).toBe(208);
    expect(result.carryForwardRiportato).toEqual([]);
  });
});

describe("TC-082 (TC-D2): net loss, generates carry-forward entry", () => {
  it("produces carryForwardRiportato with current year and correct importo", () => {
    const result = buildQuadroRT(makeBucketB(300, 800), [], 2024);
    expect(result.differenza).toBe(-500);
    expect(result.imposta).toBe(0);
    expect(result.imponibileNetto).toBe(0);
    expect(result.carryForwardApplied).toEqual([]);
    expect(result.carryForwardRiportato).toEqual([
      { annoOrigine: 2024, importo: 500 },
    ]);
  });
});

describe("TC-083 (TC-D3): CF partially offsets gain", () => {
  const cf: CarryForward[] = [
    { year: 2022, amount: 600 },
    { year: 2023, amount: 400 },
  ];

  it("applies both CF entries oldest-first and taxes the remainder", () => {
    const result = buildQuadroRT(makeBucketB(1500, 0), cf, 2024);
    expect(result.differenza).toBe(1500);
    expect(result.carryForwardApplied).toEqual([
      { annoOrigine: 2022, importo: 600 },
      { annoOrigine: 2023, importo: 400 },
    ]);
    expect(result.imponibileNetto).toBe(500);
    expect(result.imposta).toBe(130);
    expect(result.carryForwardRiportato).toEqual([]);
  });
});

describe("TC-084 (TC-D4): CF fully offsets gain — only consume what is needed", () => {
  const cf: CarryForward[] = [{ year: 2023, amount: 1200 }];

  it("consumes only 800 of the 1200 available, imposta=0", () => {
    const result = buildQuadroRT(makeBucketB(800, 0), cf, 2024);
    expect(result.carryForwardApplied).toEqual([
      { annoOrigine: 2023, importo: 800 },
    ]);
    expect(result.imponibileNetto).toBe(0);
    expect(result.imposta).toBe(0);
    expect(result.carryForwardRiportato).toEqual([]);
  });
});

describe("TC-085 (TC-D5): expired CF (gap > 4 years)", () => {
  const cf: CarryForward[] = [{ year: 2019, amount: 500 }];

  it("ignores the expired entry and taxes the full gain", () => {
    const result = buildQuadroRT(makeBucketB(1000, 0), cf, 2024);
    expect(result.carryForwardApplied).toEqual([]);
    expect(result.imponibileNetto).toBe(1000);
    expect(result.imposta).toBe(260);
  });
});

describe("TC-086 (TC-D15): unsorted CF input — must apply oldest-first", () => {
  // Input deliberately in wrong order: 2023, 2021, 2022
  const cf: CarryForward[] = [
    { year: 2023, amount: 400 },
    { year: 2021, amount: 600 },
    { year: 2022, amount: 700 },
  ];

  it("sorts entries by year and applies oldest first, partially consuming 2023", () => {
    // differenza = 1500, total CF = 1700; consume: 2021:600 + 2022:700 + 2023:200 = 1500
    const result = buildQuadroRT(makeBucketB(1500, 0), cf, 2025);
    expect(result.carryForwardApplied).toEqual([
      { annoOrigine: 2021, importo: 600 },
      { annoOrigine: 2022, importo: 700 },
      { annoOrigine: 2023, importo: 200 },
    ]);
    expect(result.imponibileNetto).toBe(0);
    expect(result.imposta).toBe(0);
  });
});

describe("TC-087 (TC-D16): break-even (differenza=0)", () => {
  it("returns all-zero output with empty CF arrays", () => {
    const result = buildQuadroRT(makeBucketB(500, 500), [], 2024);
    expect(result.differenza).toBe(0);
    expect(result.carryForwardApplied).toEqual([]);
    expect(result.imponibileNetto).toBe(0);
    expect(result.imposta).toBe(0);
    expect(result.carryForwardRiportato).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Category 15 — Quadro RM
// ---------------------------------------------------------------------------

const ETF_ISIN = "IE00B4L5Y983";
const BTP_ISIN = "IT0001086567";
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
  [BTP_ISIN]: {
    product: "BTP 2.5% 2030",
    assetClass: "GovtBondWL",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.125,
    whiteListed: true,
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

describe("TC-088 (TC-D6): ETF gain → capitaleAliquota26 populated at 26%", () => {
  it("maps the 0.26 group to capitaleAliquota26 and defaults capitaleAliquota125", () => {
    const bucketA: BucketAReport = {
      groups: [
        {
          taxRate: 0.26,
          plusvalenze: 500,
          imposta: 130,
          assetClasses: ["ETF"],
        },
      ],
      totalImposta: 130,
    };
    const result = buildQuadroRM(bucketA, [], 2024);
    expect(result.capitaleAliquota26).toEqual({
      plusvalenze: 500,
      imposta: 130,
    });
    expect(result.capitaleAliquota125).toEqual({ plusvalenze: 0, imposta: 0 });
  });
});

describe("TC-089 (TC-D7): BTP/WL gain → capitaleAliquota125 populated at 12.5%", () => {
  it("maps the 0.125 group to capitaleAliquota125 and defaults capitaleAliquota26", () => {
    const bucketA: BucketAReport = {
      groups: [
        {
          taxRate: 0.125,
          plusvalenze: 400,
          imposta: 50,
          assetClasses: ["GovtBondWL"],
        },
      ],
      totalImposta: 50,
    };
    const result = buildQuadroRM(bucketA, [], 2024);
    expect(result.capitaleAliquota26).toEqual({ plusvalenze: 0, imposta: 0 });
    expect(result.capitaleAliquota125).toEqual({
      plusvalenze: 400,
      imposta: 50,
    });
  });
});

describe("TC-090 (TC-D11): no incomeRows option → dividendiEsteri/cedole are []", () => {
  it("produces empty arrays end-to-end through Calculator", () => {
    const buy = makeTransaction({
      isin: ETF_ISIN,
      product: "iShares MSCI World",
      date: "2024-01-10",
      type: "BUY",
      quantity: 10,
      totalLocal: -1000,
      totalEUR: 1000,
    });
    const sell = makeTransaction({
      isin: ETF_ISIN,
      product: "iShares MSCI World",
      date: "2024-06-10",
      type: "SELL",
      quantity: 10,
      totalLocal: 1400,
      totalEUR: 1400,
    });
    const report = new Calculator([buy, sell], [], {
      classification: CLASSIFICATION,
    }).calculateGains("LIFO");

    expect(report.dichiarazione).toBeDefined();
    expect(report.dichiarazione!.quadroRM.dividendiEsteri).toEqual([]);
    expect(report.dichiarazione!.quadroRM.cedole).toEqual([]);
  });
});

describe("TC-091 (TC-D17): stocks-only portfolio → bucketA undefined → RM groups both {0,0}", () => {
  it("defaults both capital groups to zero with no error", () => {
    const buy = makeTransaction({
      isin: STOCK_ISIN,
      date: "2024-01-10",
      type: "BUY",
      quantity: 10,
      totalLocal: -1000,
      totalEUR: 1000,
    });
    const sell = makeTransaction({
      isin: STOCK_ISIN,
      date: "2024-06-10",
      type: "SELL",
      quantity: 10,
      totalLocal: 1400,
      totalEUR: 1400,
    });
    const report = new Calculator([buy, sell], [], {
      classification: CLASSIFICATION,
    }).calculateGains("LIFO");

    expect(report.bucketA).toBeUndefined();
    expect(report.dichiarazione!.quadroRM.capitaleAliquota26).toEqual({
      plusvalenze: 0,
      imposta: 0,
    });
    expect(report.dichiarazione!.quadroRM.capitaleAliquota125).toEqual({
      plusvalenze: 0,
      imposta: 0,
    });
  });
});

describe("TC-092 (TC-D14): ETF loss routed to Bucket B / QuadroRT, not QuadroRM", () => {
  it("keeps the ETF loss out of capitaleAliquota26 and shows it in quadroRT.minusvalenze", () => {
    const buy = makeTransaction({
      isin: ETF_ISIN,
      product: "iShares MSCI World",
      date: "2024-01-10",
      type: "BUY",
      quantity: 10,
      pricePerUnit: 105,
      totalLocal: -1050,
      totalEUR: 1050,
    });
    const sell = makeTransaction({
      isin: ETF_ISIN,
      product: "iShares MSCI World",
      date: "2024-06-10",
      type: "SELL",
      quantity: 10,
      pricePerUnit: 100,
      totalLocal: 1000,
      totalEUR: 1000,
    });
    const report = new Calculator([buy, sell], [], {
      classification: CLASSIFICATION,
    }).calculateGains("LIFO");

    expect(report.lots[0].gainLossEUR).toBe(-50);
    expect(report.lots[0].bucket).toBe("B");
    expect(report.bucketA).toBeUndefined();
    expect(report.dichiarazione!.quadroRM.capitaleAliquota26).toEqual({
      plusvalenze: 0,
      imposta: 0,
    });
    expect(report.dichiarazione!.quadroRT.minusvalenze).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Category 13 — Income-row tax-year filtering (Calculator integration)
// ---------------------------------------------------------------------------

describe("TC-076: income row outside tax year → excluded from dichiarazione with warning", () => {
  it("filters the out-of-year row and emits exactly one warning", () => {
    const buy = makeTransaction({
      isin: STOCK_ISIN,
      date: "2024-01-10",
      type: "BUY",
      quantity: 10,
      totalLocal: -1000,
      totalEUR: 1000,
    });
    const sell = makeTransaction({
      isin: STOCK_ISIN,
      date: "2024-06-10",
      type: "SELL",
      quantity: 10,
      totalLocal: 1400,
      totalEUR: 1400,
    });

    const wrongYear: IncomeRow = {
      isin: STOCK_ISIN,
      product: "Apple Inc",
      date: "2023-06-01",
      incomeType: "dividend",
      grossAmount: 30,
      withholdingTax: 4.5,
      currency: "EUR",
    };
    const correctYear: IncomeRow = {
      isin: STOCK_ISIN,
      product: "Apple Inc",
      date: "2024-07-01",
      incomeType: "dividend",
      grossAmount: 40,
      withholdingTax: 6,
      currency: "EUR",
    };

    const report = new Calculator([buy, sell], [], {
      classification: CLASSIFICATION,
      incomeRows: [wrongYear, correctYear],
    }).calculateGains("LIFO");

    expect(report.dichiarazione!.quadroRM.dividendiEsteri).toHaveLength(1);
    expect(report.dichiarazione!.quadroRM.dividendiEsteri[0].lordo).toBe(40);
    expect(report.warnings).toContain(
      "Income rows outside tax year 2024 were skipped.",
    );
    expect(report.dichiarazione!.annoImposta).toBe(2024);
  });
});

// ---------------------------------------------------------------------------
// Category 16 — Decimal precision
// ---------------------------------------------------------------------------

describe("TC-093 (TC-D13): monetary values exact to 2dp, no float drift", () => {
  it("RT: imponibileNetto=1000.01 → imposta=260.00", () => {
    const result = buildQuadroRT(makeBucketB(1000.01, 0), [], 2024);
    expect(result.imponibileNetto).toBe(1000.01);
    expect(result.imposta).toBe(260.0);
  });

  it("RM: capitaleAliquota125.plusvalenze=400.33 → imposta=50.04 (end-to-end)", () => {
    const buy = makeTransaction({
      isin: BTP_ISIN,
      product: "BTP 2.5% 2030",
      date: "2024-01-10",
      type: "BUY",
      quantity: 1,
      pricePerUnit: 1000,
      totalLocal: -1000,
      totalEUR: 1000,
    });
    const sell = makeTransaction({
      isin: BTP_ISIN,
      product: "BTP 2.5% 2030",
      date: "2024-06-10",
      type: "SELL",
      quantity: 1,
      pricePerUnit: 1400.33,
      totalLocal: 1400.33,
      totalEUR: 1400.33,
    });
    const report = new Calculator([buy, sell], [], {
      classification: CLASSIFICATION,
    }).calculateGains("LIFO");

    expect(report.dichiarazione!.quadroRM.capitaleAliquota125).toEqual({
      plusvalenze: 400.33,
      imposta: 50.04,
    });
  });

  it("RT: differenza=999.99 with CF=333.33 → imponibileNetto=666.66, imposta=173.33", () => {
    const result = buildQuadroRT(
      makeBucketB(999.99, 0),
      [{ year: 2023, amount: 333.33 }],
      2024,
    );
    expect(result.imponibileNetto).toBe(666.66);
    expect(result.imposta).toBe(173.33);
  });
});
