import { describe, it, expect } from "vitest";
import { renderReport } from "../src/cli/renderer.js";
import { it as itStrings } from "../src/i18n/it.js";
import type { GainsReport } from "../src/types.js";

const report: GainsReport = {
  method: "LIFO",
  taxYear: 2024,
  plusvalenze: 1234.56,
  minusvalenze: 0,
  netResult: 1234.56,
  lots: [],
  ratesUsed: {},
  warnings: [],
  generatedAt: new Date().toISOString(),
};

describe("TC-035 — Italian number formatting (1.234,56)", () => {
  const output = renderReport(report, itStrings);

  // Determine what "it-IT" produces on this Node.js/ICU build.
  // Full ICU: "1.234,56" (period thousands, comma decimal)
  // Small ICU: "1234,56" (no thousands grouping, but comma decimal)
  const itFormatted = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(1234.56);

  it("Intl.NumberFormat('it-IT') uses comma as decimal separator", () => {
    // The defining characteristic of Italian formatting is the comma decimal separator.
    // "1234,56" or "1.234,56" — both use a comma before the decimals.
    expect(itFormatted).toMatch(/,56$/);
  });

  it("output contains PLUSVALENZE: label", () => {
    expect(output).toContain("PLUSVALENZE:");
  });

  it("output contains the Italian-formatted value followed by EUR", () => {
    // itFormatted is either "1.234,56" or "1234,56" depending on ICU build.
    expect(output).toContain(`${itFormatted} EUR`);
  });

  it("output does NOT contain English-formatted number 1,234.56", () => {
    expect(output).not.toContain("1,234.56");
  });

  it("output does NOT contain plain English decimal 1234.56", () => {
    expect(output).not.toContain("1234.56");
  });
});
