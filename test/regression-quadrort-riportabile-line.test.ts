import { describe, it, expect } from "vitest";
import { renderReport } from "../src/cli/renderer.js";
import { en as enStrings } from "../src/i18n/en.js";
import type {
  CarryForwardEntry,
  DichiarazioneReport,
  GainsReport,
  QuadroRTReport,
} from "../src/types.js";

// Local copies of the renderer-colors.test.ts / regression-bucketb-carry-year-label.test.ts
// fixture helpers — those files don't export them.
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

function dichiarazione(quadroRTOverrides: Partial<QuadroRTReport>): DichiarazioneReport {
  return {
    version: 1,
    annoImposta: 2024,
    modello: "Redditi PF",
    generatedAt: new Date().toISOString(),
    quadroRT: {
      plusvalenze: 100,
      minusvalenze: 0,
      differenza: 100,
      carryForwardApplied: [],
      imponibileNetto: 0,
      imposta: 0,
      carryForwardRiportato: [],
      ...quadroRTOverrides,
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

// [RT-R] "Losses to carry forward" marker — see src/i18n/en.ts's quadroRTRiportabile.
const RT_R_MARKER = "[RT-R]";

describe("regression: Quadro RT [RT-R] riportabile line reflects carryForwardRiportato, not differenza's sign", () => {
  it("(a) differenza > 0 with leftover carry-forward: line IS shown with the correct remaining amount", () => {
    // 100 EUR gain this year, but the user supplied a 300 EUR 2021 carry-forward loss;
    // only 100 is consumed this year (fully offsetting the gain), leaving 200 available
    // for future years.
    const report = baseReport({
      dichiarazione: dichiarazione({
        plusvalenze: 100,
        minusvalenze: 0,
        differenza: 100,
        carryForwardApplied: [{ annoOrigine: 2021, importo: 100 }],
        imponibileNetto: 0,
        imposta: 0,
        carryForwardRiportato: [{ annoOrigine: 2021, importo: 200 }],
      }),
    });

    const output = renderReport(report, enStrings, true, false);

    expect(output).toContain(RT_R_MARKER);
    expect(output).toContain("200.00");
  });

  it("(b) differenza == 0 exactly with leftover carry-forward: line IS shown", () => {
    const report = baseReport({
      dichiarazione: dichiarazione({
        plusvalenze: 100,
        minusvalenze: 100,
        differenza: 0,
        carryForwardApplied: [{ annoOrigine: 2021, importo: 50 }],
        imponibileNetto: 0,
        imposta: 0,
        carryForwardRiportato: [{ annoOrigine: 2021, importo: 150 }],
      }),
    });

    const output = renderReport(report, enStrings, true, false);

    expect(output).toContain(RT_R_MARKER);
    expect(output).toContain("150.00");
  });

  it("(c) differenza > 0 with NO leftover carry-forward: line stays absent (no over-eager display)", () => {
    const report = baseReport({
      dichiarazione: dichiarazione({
        plusvalenze: 100,
        minusvalenze: 0,
        differenza: 100,
        carryForwardApplied: [],
        imponibileNetto: 100,
        imposta: 26,
        carryForwardRiportato: [],
      }),
    });

    const output = renderReport(report, enStrings, true, false);

    expect(output).not.toContain(RT_R_MARKER);
  });

  it("(d) pre-existing differenza < 0 case: line is still shown (unchanged behavior)", () => {
    const report = baseReport({
      dichiarazione: dichiarazione({
        plusvalenze: 0,
        minusvalenze: 300,
        differenza: -300,
        carryForwardApplied: [],
        imponibileNetto: 0,
        imposta: 0,
        carryForwardRiportato: [{ annoOrigine: 2024, importo: 300 }],
      }),
    });

    const output = renderReport(report, enStrings, true, false);

    expect(output).toContain(RT_R_MARKER);
    expect(output).toContain("300.00");
  });
});
