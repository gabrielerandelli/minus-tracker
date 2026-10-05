import { describe, it, expect } from "vitest";
import { renderReport } from "../src/cli/renderer.js";
import { en as enStrings } from "../src/i18n/en.js";
import type {
  CarryForwardEntry,
  DichiarazioneReport,
  GainsReport,
  MatchedLot,
} from "../src/types.js";

// Local copies of the renderer-colors.test.ts fixture helpers — that file
// doesn't export them.
function lot(overrides: Partial<MatchedLot>): MatchedLot {
  return {
    isin: "US0378331005",
    product: "Apple Inc",
    quantity: 10,
    buyDate: "2023-01-01",
    sellDate: "2024-01-01",
    buyPriceEUR: 150,
    sellPriceEUR: 180,
    buyCostEUR: 1502,
    sellProceedsEUR: 1798,
    gainLossEUR: 296,
    ...overrides,
  };
}

function baseReport(overrides: Partial<GainsReport> = {}): GainsReport {
  return {
    method: "LIFO",
    taxYear: 2024,
    plusvalenze: 800,
    minusvalenze: 234,
    netResult: 566,
    lots: [],
    ratesUsed: {},
    warnings: [],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function dichiarazione(
  carryForwardApplied: CarryForwardEntry[],
): DichiarazioneReport {
  return {
    version: 1,
    annoImposta: 2024,
    modello: "Redditi PF",
    generatedAt: new Date().toISOString(),
    quadroRT: {
      plusvalenze: 400,
      minusvalenze: 100,
      differenza: 300,
      carryForwardApplied,
      imponibileNetto: 0,
      imposta: 0,
      carryForwardRiportato: [],
    },
    quadroRM: {
      capitaleAliquota26: { plusvalenze: 0, imposta: 0 },
      capitaleAliquota125: { plusvalenze: 0, imposta: 0 },
      dividendiEsteri: [],
      cedole: [],
    },
    exportTo: async () => {},
  };
}

describe("regression: Bucket B carry-forward line shows the real origin year, not a fake 0", () => {
  it("single contributing year: shows the real year, never 'CARRY 0'", () => {
    const report = baseReport({
      bucketB: {
        plusvalenze: 400,
        minusvalenze: 100,
        carryForwardApplied: 300,
        carryForwardRemaining: 0,
        carryForwardEntriesRemaining: [],
        netResult: 300,
      },
      dichiarazione: dichiarazione([{ annoOrigine: 2021, importo: 300 }]),
    });

    const output = renderReport(report, enStrings, true, false);

    expect(output).toContain("2021");
    expect(output).not.toContain("CARRY 0");
    expect(output).toContain(`${enStrings.bucketBCarryApplied(2021)}: 300.00 EUR`);
  });

  it("two contributing years: shows both real years, amounts sum to carryForwardApplied", () => {
    const report = baseReport({
      bucketB: {
        plusvalenze: 500,
        minusvalenze: 100,
        carryForwardApplied: 300,
        carryForwardRemaining: 0,
        carryForwardEntriesRemaining: [],
        netResult: 400,
      },
      dichiarazione: dichiarazione([
        { annoOrigine: 2021, importo: 120 },
        { annoOrigine: 2022, importo: 180 },
      ]),
    });

    const output = renderReport(report, enStrings, true, false);

    expect(output).toContain(`${enStrings.bucketBCarryApplied(2021)}: 120.00 EUR`);
    expect(output).toContain(`${enStrings.bucketBCarryApplied(2022)}: 180.00 EUR`);
    expect(output).not.toContain("CARRY 0");

    const sum = [120, 180].reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.bucketB!.carryForwardApplied);
  });

  it("no dichiarazione present (renderer-colors.test.ts shape): does not throw, does not fabricate a year", () => {
    const report = baseReport({
      bucketB: {
        plusvalenze: 400,
        minusvalenze: 100,
        carryForwardApplied: 50,
        carryForwardRemaining: 20,
        carryForwardEntriesRemaining: [],
        netResult: 300,
      },
    });

    let output = "";
    expect(() => {
      output = renderReport(report, enStrings, false, false);
    }).not.toThrow();

    expect(output).not.toContain("CARRY 0");
    expect(output).toContain(`${enStrings.bucketBCarryAppliedUnknownYear}: 50.00 EUR`);
  });
});
