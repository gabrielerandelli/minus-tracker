import { describe, it, expect } from "vitest";
import { renderReport } from "../src/cli/renderer.js";
import { en as enStrings } from "../src/i18n/en.js";
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

describe("TC-036 — English number formatting (1,234.56)", () => {
  const output = renderReport(report, enStrings);

  // Derive expected format dynamically for small-ICU portability.
  // Full ICU: "1,234.56" (comma thousands, period decimal)
  // Small ICU: "1234.56" (no thousands grouping, but period decimal)
  const expectedFormatted = new Intl.NumberFormat(enStrings.numberLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(1234.56);

  it("Intl.NumberFormat('en-US') uses period as decimal separator", () => {
    // The defining characteristic of English formatting is the period decimal separator.
    // "1234.56" or "1,234.56" — both use a period before the decimals.
    expect(expectedFormatted).toMatch(/\.56$/);
  });

  it("output contains PLUSVALENZE: label", () => {
    expect(output).toContain("PLUSVALENZE:");
  });

  it("output contains the English-formatted value followed by EUR", () => {
    // expectedFormatted is either "1,234.56" or "1234.56" depending on ICU build.
    expect(output).toContain(`${expectedFormatted} EUR`);
  });

  it("output does NOT contain Italian-formatted number with comma decimal ,56", () => {
    expect(output).not.toMatch(/,56\b/);
  });
});
