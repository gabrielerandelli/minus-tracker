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

  // Carry-forward consumption: oldest-first, only unexpired entries
  // (taxYear - entry.year <= 4), consuming only what this year's
  // `differenza` still needs. This mirrors the consumption order/formula
  // Calculator.calculateGains uses to derive bucketB.carryForwardEntriesRemaining
  // (src/calculator/index.ts) so the two stay in agreement; it is run in a
  // single pass covering all three differenza signs (>0, ==0, <0) so that,
  // unlike before, an un-expired supplied entry's unconsumed balance is
  // never silently dropped regardless of this year's result.
  const sorted = [...carryForward].sort((a, b) => a.year - b.year);
  let remaining = differenza;
  const carryForwardApplied: CarryForwardEntry[] = [];
  const carryForwardRiportato: CarryForwardEntry[] = [];

  // Cumulative-rounding allocation: each entry's displayed `importo` is derived
  // from the delta between two roundings of a running (unrounded) total, not by
  // rounding its own `consumed` amount in isolation. This guarantees the sum of
  // displayed importo values telescopes to exactly roundHalfUp(cumulativeConsumed)
  // — the same "sum-then-round-once" formula Calculator.calculateGains uses for
  // bucketB.carryForwardApplied (src/calculator/index.ts) — instead of drifting a
  // cent or more above it, as independent per-entry rounding could. Each entry's
  // own `consumed`/`residual` bookkeeping (which drives `remaining` and
  // carryForwardRiportato below) stays on the unrounded amounts throughout, so
  // only the *displayed* per-entry euro split changes, never the totals.
  let cumulativeConsumed = 0;
  let cumulativeConsumedRounded = 0;

  for (const entry of sorted) {
    if (taxYear - entry.year > 4) continue; // expired: gone, not "remaining"
    const consumed = remaining > 0 ? Math.min(entry.amount, remaining) : 0;
    if (consumed > 0) {
      cumulativeConsumed += consumed;
      const newCumulativeRounded = roundHalfUp(cumulativeConsumed);
      const entryImporto = roundHalfUp(
        newCumulativeRounded - cumulativeConsumedRounded,
      );
      if (entryImporto > 0) {
        carryForwardApplied.push({
          annoOrigine: entry.year,
          importo: entryImporto,
        });
      }
      cumulativeConsumedRounded = newCumulativeRounded;
      remaining -= consumed;
    }
    const residual = roundHalfUp(entry.amount - consumed);
    if (residual > 0) {
      carryForwardRiportato.push({
        annoOrigine: entry.year,
        importo: residual,
      });
    }
  }

  const netResult = roundHalfUp(remaining);
  if (netResult < 0) {
    // This year's own new loss, not covered by any supplied carryForward.
    carryForwardRiportato.push({
      annoOrigine: taxYear,
      importo: roundHalfUp(Math.abs(netResult)),
    });
  }

  const imponibileNetto = netResult > 0 ? roundHalfUp(netResult) : 0;
  const imposta = roundHalfUp(imponibileNetto * 0.26);

  return {
    plusvalenze,
    minusvalenze,
    differenza,
    carryForwardApplied,
    imponibileNetto,
    imposta,
    carryForwardRiportato,
  };
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
