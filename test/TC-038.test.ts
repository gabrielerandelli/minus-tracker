import { describe, it, expect } from "vitest";
import { renderReport } from "../src/cli/renderer.js";
import { it as itStrings } from "../src/i18n/it.js";
import { en as enStrings } from "../src/i18n/en.js";
import type { GainsReport } from "../src/types.js";

const ITALIAN_DISCLAIMER =
  "minus-tracker è un ausilio al calcolo, non consulenza fiscale.";

const report: GainsReport = {
  method: "LIFO",
  taxYear: 2024,
  plusvalenze: 0,
  minusvalenze: 0,
  netResult: 0,
  lots: [],
  ratesUsed: {},
  warnings: [],
  generatedAt: new Date().toISOString(),
};

describe("TC-038 — Disclaimer always in Italian regardless of locale", () => {
  it("renderReport with Italian strings contains the Italian disclaimer verbatim", () => {
    const output = renderReport(report, itStrings);
    expect(output).toContain(ITALIAN_DISCLAIMER);
  });

  it("renderReport with English strings ALSO contains the Italian disclaimer verbatim", () => {
    const output = renderReport(report, enStrings);
    expect(output).toContain(ITALIAN_DISCLAIMER);
  });
});
