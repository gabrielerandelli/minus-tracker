import { describe, it, expect } from "vitest";
import {
  DEGIROParser,
  IBKRParser,
  Calculator,
  Classifier,
  ParseError,
} from "../src/index.js";
import type {
  IncomeRow,
  CarryForwardEntry,
  DividendEntry,
  CedolaEntry,
  QuadroRTReport,
  QuadroRMReport,
  DichiarazioneReport,
  CalculatorOptions,
  GainsReport,
  Parser,
} from "../src/index.js";

/**
 * TC-097: v0.7.0 named exports present and correctly typed.
 *
 * TypeScript types have no runtime representation, so most assertions here are
 * compile-time checks: constructing a value that satisfies an imported type only
 * type-checks if the type is exported from "../src/index.js" with the expected
 * shape. If `npx tsc --noEmit` is clean, the type-level assertions below hold.
 * A handful of `expect()` calls confirm the constructed values round-trip at
 * runtime as a sanity check.
 */
describe("TC-097: v0.7.0 named exports present and correctly typed", () => {
  it("step 1: value exports resolve unchanged from v0.6.0", () => {
    expect(typeof DEGIROParser).toBe("function");
    expect(typeof Calculator).toBe("function");
    expect(typeof Classifier).toBe("function");
  });

  it("step 2: IncomeRow, CarryForwardEntry, DividendEntry, CedolaEntry are available as type imports", () => {
    const incomeRow: IncomeRow = {
      isin: "US0378331005",
      product: "Apple Inc",
      date: "2024-06-15",
      incomeType: "dividend",
      grossAmount: 100,
      withholdingTax: 15,
      currency: "USD",
      fxRate: 1.08,
    };
    const carryForwardEntry: CarryForwardEntry = {
      annoOrigine: 2023,
      importo: 500,
    };
    const dividendEntry: DividendEntry = {
      isin: "US0378331005",
      prodotto: "Apple Inc",
      lordo: 100,
      rittenutaEstera: 15,
    };
    const cedolaEntry: CedolaEntry = {
      isin: "IT0000000000",
      prodotto: "BTP Test",
      importo: 50,
      rittenutaEstera: 0,
    };

    expect(incomeRow.incomeType).toBe("dividend");
    expect(carryForwardEntry.annoOrigine).toBe(2023);
    expect(dividendEntry.rittenutaEstera).toBe(15);
    expect(cedolaEntry.importo).toBe(50);
  });

  it("step 3: QuadroRTReport, QuadroRMReport, DichiarazioneReport are available as type imports", () => {
    const quadroRT: QuadroRTReport = {
      plusvalenze: 1000,
      minusvalenze: 200,
      differenza: 800,
      carryForwardApplied: [{ annoOrigine: 2023, importo: 500 }],
      imponibileNetto: 300,
      imposta: 78,
      carryForwardRiportato: [],
    };
    const quadroRM: QuadroRMReport = {
      capitaleAliquota26: { plusvalenze: 100, imposta: 26 },
      capitaleAliquota125: { plusvalenze: 0, imposta: 0 },
      dividendiEsteri: [
        {
          isin: "US0378331005",
          prodotto: "Apple Inc",
          lordo: 100,
          rittenutaEstera: 15,
        },
      ],
      cedole: [],
    };
    const dichiarazione: DichiarazioneReport = {
      version: 1,
      annoImposta: 2024,
      modello: "Redditi PF",
      generatedAt: new Date().toISOString(),
      quadroRT,
      quadroRM,
      exportTo: async (_path: string) => {},
    };

    expect(dichiarazione.modello).toBe("Redditi PF");
    expect(dichiarazione.quadroRT.differenza).toBe(800);
    expect(dichiarazione.quadroRM.dividendiEsteri).toHaveLength(1);
  });

  it("steps 4-5: parser.incomeRows is typed as IncomeRow[] and feeds CalculatorOptions.incomeRows", () => {
    const header = [
      "Date",
      "Time",
      "Product",
      "ISIN",
      "Exchange",
      "Execution centre",
      "Quantity",
      "Price",
      "Local value",
      "Local value currency",
      "Value",
      "Value currency",
      "Exchange rate",
      "Transaction costs",
      "Transaction costs currency",
      "Total",
      "Total currency",
      "Order ID",
    ].join(",");
    const dividendRow = [
      "15-06-2024",
      "09:00",
      "Apple Inc - DIVIDEND",
      "US0378331005",
      "",
      "",
      "0",
      "",
      "100.00",
      "EUR",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "div-001",
    ].join(",");
    const csv = `${header}\n${dividendRow}\n`;

    const parser = new DEGIROParser();
    parser.parse(csv);
    const incomeRows: IncomeRow[] = parser.incomeRows;

    expect(incomeRows).toHaveLength(1);
    expect(incomeRows[0].incomeType).toBe("dividend");
    expect(incomeRows[0].grossAmount).toBe(100);

    const options: CalculatorOptions = { incomeRows: parser.incomeRows };
    const calculator = new Calculator([], [], options);

    expect(options.incomeRows).toHaveLength(1);
    expect(calculator).toBeInstanceOf(Calculator);
  });

  it("step 6: GainsReport.dichiarazione is typed as DichiarazioneReport | undefined", () => {
    const withoutDichiarazione: GainsReport["dichiarazione"] = undefined;
    expect(withoutDichiarazione).toBeUndefined();
  });

  it("step 7: DichiarazioneReport.exportTo returns Promise<void>", async () => {
    const exportTo: DichiarazioneReport["exportTo"] = async (
      _path: string,
    ) => {};
    const result = exportTo("trades.dichiarazione.json");

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });
});

/**
 * TC-164/165/166: v0.11.0 public API — IBKRParser + Parser interface exports,
 * ParseError structured-field mutual exclusivity, and section-prefixed
 * warnings with independent per-section row counters.
 *
 * As with TC-097 above, most of the value here is compile-time: if this file
 * type-checks, `IBKRParser`/`DEGIROParser` structurally satisfy `Parser` as
 * exported from "../src/index.js". The `expect()` calls are runtime sanity
 * checks layered on top.
 */
describe("TC-164...166: IBKRParser + Parser export, ParseError fields, section-prefixed warnings", () => {
  it("TC-164: IBKRParser and DEGIROParser both resolve as constructable functions and satisfy Parser", () => {
    expect(typeof IBKRParser).toBe("function");
    expect(typeof DEGIROParser).toBe("function");

    // Compile-time proof: this only type-checks if both classes structurally
    // satisfy the `Parser` interface exported from "../src/index.js".
    const p1: Parser = new IBKRParser();
    const p2: Parser = new DEGIROParser();

    expect(p1.warnings).toEqual([]);
    expect(p1.incomeRows).toEqual([]);
    expect(p2.warnings).toEqual([]);
    expect(p2.incomeRows).toEqual([]);
  });

  describe("TC-165: ParseError.sectionName/.columnName are mutually exclusive and code-specific", () => {
    const DEGIRO_FULL_HEADER =
      "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
    const DEGIRO_DATA_ROW =
      "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";

    const binaryGarbage = "Field1\x00\x01Field2\nbinary garbage...";

    it("step 1: MISSING_SECTION (IBKR only) — sectionName set, columnName undefined", () => {
      // No Trades section at all — only Dividends.
      const csv = [
        "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
        "Dividends,Data,USD,US0378331005,AAPL,20240315,APPLE INC DIVIDEND,2.40",
      ].join("\n");

      const parser = new IBKRParser();
      try {
        parser.parse(csv);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError);
        const e = err as ParseError;
        expect(e.code).toBe("MISSING_SECTION");
        expect(e.sectionName).toBe("Trades");
        expect(e.columnName).toBeUndefined();
      }
    });

    it("step 2: MISSING_COLUMN from IBKRParser — columnName set, sectionName undefined", () => {
      // Trades header omits IBCommissionCurrency.
      const csv = [
        "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission",
        "Trades,Data,Order,STK,USD,AAPL,APPLE INC,US0378331005,20240102,BUY,10,185.00,-2.00",
      ].join("\n");

      const parser = new IBKRParser();
      try {
        parser.parse(csv);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError);
        const e = err as ParseError;
        expect(e.code).toBe("MISSING_COLUMN");
        expect(e.columnName).toBe("IBCommissionCurrency");
        expect(e.sectionName).toBeUndefined();
      }
    });

    it("step 3: MISSING_COLUMN from DEGIROParser — columnName set, sectionName undefined", () => {
      // Header omits ISIN.
      const cols = DEGIRO_FULL_HEADER.split(",").filter((c) => c !== "ISIN");
      const csv = [cols.join(","), DEGIRO_DATA_ROW].join("\n");

      const parser = new DEGIROParser();
      try {
        parser.parse(csv);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError);
        const e = err as ParseError;
        expect(e.code).toBe("MISSING_COLUMN");
        expect(e.columnName).toBe("ISIN");
        expect(e.sectionName).toBeUndefined();
      }
    });

    it("step 4a: INVALID_CSV from IBKRParser — both columnName and sectionName undefined", () => {
      const parser = new IBKRParser();
      try {
        parser.parse(binaryGarbage);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError);
        const e = err as ParseError;
        expect(e.code).toBe("INVALID_CSV");
        expect(e.columnName).toBeUndefined();
        expect(e.sectionName).toBeUndefined();
      }
    });

    it("step 4b: INVALID_CSV from DEGIROParser — both columnName and sectionName undefined", () => {
      const parser = new DEGIROParser();
      try {
        parser.parse(binaryGarbage);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError);
        const e = err as ParseError;
        expect(e.code).toBe("INVALID_CSV");
        expect(e.columnName).toBeUndefined();
        expect(e.sectionName).toBeUndefined();
      }
    });
  });

  it("TC-166: warnings are section-prefixed with independent per-section row counters", () => {
    const csv = [
      "Trades,Header,DataDiscriminator,AssetCategory,CurrencyPrimary,Symbol,Description,ISIN,TradeDate,Buy/Sell,Quantity,TradePrice,IBCommission,IBCommissionCurrency",
      "Trades,Data,Order,STK,EUR,VWCE,VANGUARD FTSE ALL-WORLD,IE00BK5BQT80,20240102,BUY,5,95.00,-1.00,EUR",
      "Trades,Data,Order,STK,EUR,AAPL,APPLE INC,IE00BK5BQT80,20240103,BUY,5,95.00,-1.00,EUR",
      "Trades,Data,Order,STK,EUR,AAPL,APPLE INC,,20240104,BUY,5,95.00,-1.00,EUR",
      "Dividends,Header,CurrencyPrimary,ISIN,Symbol,Date,Description,Amount",
      "Dividends,Data,EUR,IE00BK5BQT80,VWCE,20240315,VWCE DIVIDEND,10.00",
      "Dividends,Data,EUR,,GENERIC,20240316,GENERIC DIVIDEND,5.00",
    ].join("\n");

    const parser = new IBKRParser();
    parser.parse(csv);

    expect(parser.warnings).toContain("Trades row 3: missing ISIN — skipped");
    expect(parser.warnings).toContain(
      "Dividends row 2: missing ISIN — skipped",
    );
  });
});
