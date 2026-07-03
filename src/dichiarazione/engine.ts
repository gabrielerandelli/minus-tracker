import { writeFile } from "node:fs/promises";
import type {
  BucketAReport,
  BucketBReport,
  CarryForward,
  CarryForwardEntry,
  DichiarazioneReport,
  IncomeRow,
  QuadroRMReport,
  QuadroRTReport,
} from "../types.js";

function roundHalfUp(x: number): number {
  return (Math.sign(x) * Math.round(Math.abs(x) * 100)) / 100;
}

export function buildQuadroRT(
  bucketB: BucketBReport,
  carryForward: CarryForward[],
  taxYear: number,
): QuadroRTReport {
  const plusvalenze = bucketB.plusvalenze;
  const minusvalenze = bucketB.minusvalenze;
  const differenza = roundHalfUp(plusvalenze - minusvalenze);

  if (differenza > 0) {
    const sorted = [...carryForward].sort((a, b) => a.year - b.year);
    let remaining = differenza;
    const carryForwardApplied: CarryForwardEntry[] = [];

    for (const entry of sorted) {
      if (taxYear - entry.year > 4) continue;
      const consumed = Math.min(entry.amount, remaining);
      if (consumed > 0) {
        carryForwardApplied.push({
          annoOrigine: entry.year,
          importo: roundHalfUp(consumed),
        });
        remaining -= consumed;
      }
    }

    const imponibileNetto = roundHalfUp(remaining);
    const imposta = roundHalfUp(imponibileNetto * 0.26);

    return {
      plusvalenze,
      minusvalenze,
      differenza,
      carryForwardApplied,
      imponibileNetto,
      imposta,
      carryForwardRiportato: [],
    };
  } else if (differenza < 0) {
    return {
      plusvalenze,
      minusvalenze,
      differenza,
      carryForwardApplied: [],
      imponibileNetto: 0,
      imposta: 0,
      carryForwardRiportato: [
        { annoOrigine: taxYear, importo: roundHalfUp(Math.abs(differenza)) },
      ],
    };
  } else {
    return {
      plusvalenze,
      minusvalenze,
      differenza: 0,
      carryForwardApplied: [],
      imponibileNetto: 0,
      imposta: 0,
      carryForwardRiportato: [],
    };
  }
}

export function buildQuadroRM(
  bucketA: BucketAReport | undefined,
  incomeRows: IncomeRow[],
  taxYear: number,
): QuadroRMReport {
  const groups = bucketA?.groups ?? [];

  const group26 = groups.find((g) => g.taxRate === 0.26);
  const group125 = groups.find((g) => g.taxRate === 0.125);

  const capitaleAliquota26 = {
    plusvalenze: group26?.plusvalenze ?? 0,
    imposta: group26?.imposta ?? 0,
  };
  const capitaleAliquota125 = {
    plusvalenze: group125?.plusvalenze ?? 0,
    imposta: group125?.imposta ?? 0,
  };

  const dividendiEsteri = incomeRows
    .filter((r) => r.incomeType === "dividend")
    .map((r) => ({
      isin: r.isin,
      prodotto: r.product,
      lordo: r.grossAmount,
      rittenutaEstera: r.withholdingTax,
    }));

  const cedole = incomeRows
    .filter((r) => r.incomeType === "coupon")
    .map((r) => ({
      isin: r.isin,
      prodotto: r.product,
      importo: r.grossAmount,
      rittenutaEstera: r.withholdingTax,
    }));

  return {
    capitaleAliquota26,
    capitaleAliquota125,
    dividendiEsteri,
    cedole,
  };
}

export function buildDichiarazioneReport(
  quadroRT: QuadroRTReport,
  quadroRM: QuadroRMReport,
  taxYear: number,
): DichiarazioneReport {
  const version = 1;
  const modello = "Redditi PF" as const;
  const generatedAt = new Date().toISOString();

  return {
    version,
    annoImposta: taxYear,
    modello,
    generatedAt,
    quadroRT,
    quadroRM,
    exportTo: async (path: string) => {
      await writeFile(
        path,
        JSON.stringify(
          {
            version,
            annoImposta: taxYear,
            modello,
            generatedAt,
            quadroRT,
            quadroRM,
          },
          null,
          2,
        ),
      );
    },
  };
}
