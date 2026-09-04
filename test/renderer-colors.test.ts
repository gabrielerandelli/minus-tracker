import { describe, it, expect } from "vitest";
import { renderReport } from "../src/cli/renderer.js";
import { stripAnsi } from "../src/cli/colors.js";
import { it as itStrings } from "../src/i18n/it.js";
import { en as enStrings } from "../src/i18n/en.js";
import type { GainsReport, MatchedLot } from "../src/types.js";

const NAVY = "\x1b[38;2;27;73;101m";
const GREEN = "\x1b[38;2;74;222;128m";
const RED = "\x1b[38;2;248;113;113m";
const AMBER = "\x1b[38;2;251;191;36m";

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

describe("TC-206: table column headers navy; data columns unstyled", () => {
  const report = baseReport({ lots: [lot({ gainLossEUR: 120.5 })] });
  const output = renderReport(report, itStrings, false, true);
  const headerLine = output.split("\n").find((l) => l.includes("ISIN"))!;
  const dataLine = output.split("\n").find((l) => l.includes("US0378331005"))!;

  it("every header cell carries the navy escape", () => {
    expect(headerLine).toContain(NAVY);
  });

  it("data columns (ISIN/product/qty/dates/EUR) carry no color escapes", () => {
    // Strip the (colored) GAIN/LOSS cell off the end before asserting the rest is plain.
    const withoutGainLoss = dataLine.split(GREEN)[0];
    expect(withoutGainLoss).not.toContain(NAVY);
    expect(withoutGainLoss).not.toContain(RED);
  });
});

describe("TC-207: GAIN/LOSS column colored green/red matching formatGainLoss's sign", () => {
  const report = baseReport({
    lots: [
      lot({ isin: "GAIN000000001", gainLossEUR: 120.5 }),
      lot({ isin: "LOSS000000001", gainLossEUR: -30 }),
    ],
  });
  const output = renderReport(report, itStrings, false, true);
  const lines = output.split("\n");
  const gainLine = lines.find((l) => l.includes("GAIN000000001"))!;
  const lossLine = lines.find((l) => l.includes("LOSS000000001"))!;

  it("the +120,50 cell is colored green", () => {
    expect(gainLine).toContain(GREEN);
    expect(gainLine).not.toContain(RED);
  });

  it("the -30,00 cell is colored red", () => {
    expect(lossLine).toContain(RED);
    expect(lossLine).not.toContain(GREEN);
  });
});

describe("TC-208: PLUSVALENZE/MINUSVALENZE — label unstyled, value green/red", () => {
  const report = baseReport({ plusvalenze: 800, minusvalenze: 234 });
  const output = renderReport(report, itStrings, false, true);
  const lines = output.split("\n");
  const plusLine = lines.find((l) => stripAnsi(l).startsWith("PLUSVALENZE:"))!;
  const minusLine = lines.find((l) =>
    stripAnsi(l).startsWith("MINUSVALENZE:"),
  )!;

  it("PLUSVALENZE: label unstyled, 800,00 EUR green", () => {
    expect(plusLine.startsWith("PLUSVALENZE:")).toBe(true);
    expect(plusLine).toContain(GREEN);
  });

  it("MINUSVALENZE: label unstyled, 234,00 EUR red", () => {
    expect(minusLine.startsWith("MINUSVALENZE:")).toBe(true);
    expect(minusLine).toContain(RED);
  });
});

describe("TC-209: NET RESULT is now signed and colored by sign", () => {
  it("positive result renders +566,00 EUR, colored green", () => {
    const output = renderReport(
      baseReport({ netResult: 566 }),
      itStrings,
      false,
      true,
    );
    const line = output.split("\n").find((l) => l.includes("RISULTATO NETTO"))!;
    expect(stripAnsi(line)).toContain("+566,00 EUR");
    expect(line).toContain(GREEN);
  });

  it("negative result renders -120,00 EUR, colored red", () => {
    const output = renderReport(
      baseReport({ netResult: -120 }),
      itStrings,
      false,
      true,
    );
    const line = output.split("\n").find((l) => l.includes("RISULTATO NETTO"))!;
    expect(stripAnsi(line)).toContain("-120,00 EUR");
    expect(line).toContain(RED);
  });

  it("--no-color: same signed text, no ANSI escapes", () => {
    const output = renderReport(
      baseReport({ netResult: 566 }),
      itStrings,
      false,
      false,
    );
    const line = output.split("\n").find((l) => l.includes("RISULTATO NETTO"))!;
    expect(line).toBe(stripAnsi(line));
    expect(line).toContain("+566,00 EUR");
  });
});

describe("TC-210: NET RESULT at exactly zero renders +0.00, colored green (boundary)", () => {
  it("renders RISULTATO NETTO: +0,00 EUR, colored green", () => {
    const output = renderReport(
      baseReport({ netResult: 0 }),
      itStrings,
      false,
      true,
    );
    const line = output.split("\n").find((l) => l.includes("RISULTATO NETTO"))!;
    expect(stripAnsi(line)).toContain("+0,00 EUR");
    expect(line).toContain(GREEN);
    expect(line).not.toContain(RED);
  });
});

describe("TC-211: WARNINGS value amber when n > 0, unstyled when n == 0", () => {
  it("WARNINGS: 3 — value colored amber", () => {
    const output = renderReport(
      baseReport({ warnings: ["a", "b", "c"] }),
      itStrings,
      false,
      true,
    );
    const line = output
      .split("\n")
      .find((l) => stripAnsi(l).includes("AVVERTENZE: 3"))!;
    expect(line).toContain(AMBER);
  });

  it("WARNINGS: 0 — unstyled", () => {
    const output = renderReport(
      baseReport({ warnings: [] }),
      itStrings,
      false,
      true,
    );
    const line = output
      .split("\n")
      .find((l) => stripAnsi(l).includes("AVVERTENZE: 0"))!;
    expect(line).toBe(stripAnsi(line));
  });
});

describe("TC-212: pre-table AVVISO/WARNING lines and warnMixedBuckets — whole-line amber", () => {
  it("an AVVISO: warning line is wrapped in amber as a whole line", () => {
    const output = renderReport(
      baseReport({ warnings: ["AVVISO: qualcosa è successo"] }),
      itStrings,
      false,
      true,
    );
    const line = output
      .split("\n")
      .find((l) => l.includes("AVVISO: qualcosa è successo"))!;
    expect(line).toBe(`${AMBER}AVVISO: qualcosa è successo\x1b[0m`);
  });

  it("the warnMixedBuckets footnote is wrapped in amber as a whole line", () => {
    const output = renderReport(
      baseReport({
        bucketA: { groups: [], totalImposta: 0 },
        bucketB: {
          plusvalenze: 400,
          minusvalenze: 100,
          carryForwardApplied: 0,
          carryForwardRemaining: 0,
          carryForwardEntriesRemaining: [],
          netResult: 300,
        },
      }),
      itStrings,
      false,
      true,
    );
    const mixedLine = output
      .split("\n")
      .find((l) => stripAnsi(l) === itStrings.warnMixedBuckets)!;
    expect(mixedLine).toBe(`${AMBER}${itStrings.warnMixedBuckets}\x1b[0m`);
  });
});

describe("TC-213: BUCKET A/BUCKET B section headers colored navy", () => {
  const report = baseReport({
    bucketA: {
      groups: [{ taxRate: 0.26, assetClasses: ["ETF"], plusvalenze: 500, imposta: 130 }],
      totalImposta: 130,
    },
    bucketB: {
      plusvalenze: 400,
      minusvalenze: 100,
      carryForwardApplied: 0,
      carryForwardRemaining: 0,
      carryForwardEntriesRemaining: [],
      netResult: 300,
    },
  });
  const output = renderReport(report, itStrings, false, true);
  const lines = output.split("\n");

  it("BUCKET A header is navy", () => {
    const line = lines.find((l) => stripAnsi(l) === itStrings.bucketAHeader)!;
    expect(line).toBe(`${NAVY}${itStrings.bucketAHeader}\x1b[0m`);
  });

  it("BUCKET B header is navy", () => {
    const line = lines.find((l) => stripAnsi(l) === itStrings.bucketBHeader)!;
    expect(line).toBe(`${NAVY}${itStrings.bucketBHeader}\x1b[0m`);
  });
});

describe("TC-214: Bucket A per-group line — mixed per-value coloring", () => {
  const report = baseReport({
    bucketA: {
      groups: [
        { taxRate: 0.26, assetClasses: ["ETF"], plusvalenze: 500, imposta: 130 },
      ],
      totalImposta: 130,
    },
  });
  const output = renderReport(report, itStrings, false, true);
  const groupLine = output
    .split("\n")
    .find((l) => stripAnsi(l).includes("imposta:") && stripAnsi(l).includes("26%"))!;
  const totalLine = output
    .split("\n")
    .find((l) => stripAnsi(l).startsWith(itStrings.bucketATotalTax))!;

  it("plain-text content matches the pre-v0.12.0 layout exactly", () => {
    expect(stripAnsi(groupLine)).toBe(
      `${itStrings.bucketAEtf}: 500,00 EUR → imposta: 130,00 EUR (26%)`,
    );
  });

  it("only the imposta: label+figure segment is navy — label/plusvalenze/rate unstyled", () => {
    expect(groupLine).toContain(`${NAVY}imposta: 130,00 EUR \x1b[0m`);
    // Nothing before "imposta:" carries an escape.
    const beforeImposta = groupLine.split(`${NAVY}imposta:`)[0];
    expect(beforeImposta).toBe(stripAnsi(beforeImposta));
  });

  it("bucketATotalTax's value is navy", () => {
    expect(totalLine).toContain(NAVY);
    expect(stripAnsi(totalLine)).toBe(
      `${itStrings.bucketATotalTax}: 130,00 EUR`,
    );
  });
});

describe("TC-215: Bucket B — value-only green/red, signed result line", () => {
  const report = baseReport({
    bucketB: {
      plusvalenze: 400,
      minusvalenze: 100,
      carryForwardApplied: 0,
      carryForwardRemaining: 0,
      carryForwardEntriesRemaining: [],
      netResult: 300,
    },
  });
  const output = renderReport(report, itStrings, false, true);
  const lines = output.split("\n");
  const plusLine = lines.find((l) => stripAnsi(l).startsWith("PLUSVALENZE: 400"))!;
  const minusLine = lines.find((l) => stripAnsi(l).startsWith("MINUSVALENZE: 100"))!;
  const resultLine = lines.find((l) =>
    stripAnsi(l).startsWith(`${itStrings.bucketBResult}: `),
  )!;

  it("Bucket B PLUSVALENZE/MINUSVALENZE follow the top-level label-unstyled/value-colored pattern", () => {
    expect(plusLine).toContain(GREEN);
    expect(minusLine).toContain(RED);
  });

  it("Bucket B result line renders signed (+300,00), colored green", () => {
    expect(stripAnsi(resultLine)).toContain("+300,00 EUR");
    expect(resultLine).toContain(GREEN);
  });
});

describe("TC-216: Dichiarazione headers navy; nota/warning-row amber; disclaimer always unstyled", () => {
  const dichiarazione = {
    version: 1,
    annoImposta: 2024,
    modello: "Redditi PF" as const,
    generatedAt: new Date().toISOString(),
    quadroRT: {
      plusvalenze: 500,
      minusvalenze: 0,
      differenza: 500,
      carryForwardApplied: [],
      imponibileNetto: 500,
      imposta: 130,
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
  const report = baseReport({ dichiarazione });
  const output = renderReport(report, itStrings, false, true);
  const lines = output.split("\n");

  it("QUADRO RT/QUADRO RM headers are navy", () => {
    const rtLine = lines.find((l) => stripAnsi(l) === itStrings.quadroRTHeader)!;
    const rmLine = lines.find((l) => stripAnsi(l) === itStrings.quadroRMHeader)!;
    expect(rtLine).toBe(`${NAVY}${itStrings.quadroRTHeader}\x1b[0m`);
    expect(rmLine).toBe(`${NAVY}${itStrings.quadroRMHeader}\x1b[0m`);
  });

  it("dichiarazioneNota/dichiarazioneWarningRow are whole-line amber", () => {
    const notaLine = lines.find((l) => stripAnsi(l) === itStrings.dichiarazioneNota)!;
    const warningLine = lines.find(
      (l) => stripAnsi(l) === itStrings.dichiarazioneWarningRow,
    )!;
    expect(notaLine).toBe(`${AMBER}${itStrings.dichiarazioneNota}\x1b[0m`);
    expect(warningLine).toBe(`${AMBER}${itStrings.dichiarazioneWarningRow}\x1b[0m`);
  });

  it("dichiarazioneDisclaimer is unstyled regardless of color", () => {
    const disclaimerLine = lines.find(
      (l) => l === itStrings.dichiarazioneDisclaimer,
    )!;
    expect(disclaimerLine).toBeDefined();
    expect(disclaimerLine).toBe(stripAnsi(disclaimerLine));
  });
});

describe("Task 58 acceptance: stripAnsi(renderReport(..., true)) === renderReport(..., false)", () => {
  const fixtures: GainsReport[] = [
    baseReport(),
    baseReport({ lots: [lot({}), lot({ isin: "LOSS1", gainLossEUR: -30 })] }),
    baseReport({ netResult: 0 }),
    baseReport({ warnings: ["AVVISO: attenzione"] }),
    baseReport({
      bucketA: {
        groups: [
          { taxRate: 0.26, assetClasses: ["ETF"], plusvalenze: 500, imposta: 130 },
        ],
        totalImposta: 130,
      },
      bucketB: {
        plusvalenze: 400,
        minusvalenze: 100,
        carryForwardApplied: 50,
        carryForwardRemaining: 20,
        carryForwardEntriesRemaining: [],
        netResult: 300,
      },
    }),
  ];

  it.each(fixtures.map((f, i) => [i, f] as const))(
    "fixture %i: color output strips back to the uncolored render, byte-for-byte",
    (_i, report) => {
      const colored = renderReport(report, itStrings, false, true);
      const uncolored = renderReport(report, itStrings, false, false);
      expect(stripAnsi(colored)).toBe(uncolored);
    },
  );

  it("also holds for English locale", () => {
    const report = baseReport({ lots: [lot({})] });
    const colored = renderReport(report, enStrings, false, true);
    const uncolored = renderReport(report, enStrings, false, false);
    expect(stripAnsi(colored)).toBe(uncolored);
  });
});
