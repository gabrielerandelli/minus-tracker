import { describe, it, expect } from "vitest";
import { DEGIROParser, Calculator, Classifier } from "../src/index.js";
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
