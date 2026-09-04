import type { GainsReport, AssetClass } from "../types.js";
import type { LocaleStrings } from "../i18n/types.js";
import { renderSegments, type Segment } from "./colors.js";

const SEPARATOR = "─".repeat(72);

// Palette (Part 18): navy for headers/informational labels, green/red for
// signed gain-loss values, amber for warnings.
const NAVY = "#1B4965";
const GREEN = "#4ADE80";
const RED = "#F87171";
const AMBER = "#FBBF24";

function formatEUR(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatGainLoss(amount: number, locale: string): string {
  const formatted = formatEUR(Math.abs(amount), locale);
  return amount >= 0 ? `+${formatted}` : `-${formatted}`;
}

function assetClassLabel(ac: AssetClass, s: LocaleStrings): string {
  if (ac === "ETF") return s.bucketAEtf;
  if (ac === "GovtBondWL" || ac === "GovtBondOther") return s.bucketABtpWl;
  return ac;
}

/** Renders a single whole-line segment (no value/label split), e.g. section headers and
 * full-sentence warnings. `hex` is applied to the entire line. */
function wholeLine(text: string, hex: string | undefined, color: boolean): string {
  return renderSegments([{ text, hex }], color);
}

/**
 * Joins an ordered list of cells into one row, baking each cell's own separator padding into
 * its segment text before coloring — the padding-before-color invariant `colors.ts` requires.
 * Mirrors the pre-v0.12.0 `cells.join(separator)` shape while letting each cell carry its own
 * optional `hex`.
 */
function joinCells(
  cells: { text: string; hex?: string }[],
  separator: string,
  color: boolean,
): string {
  const segments: Segment[] = cells.map((cell, i) => ({
    text: i < cells.length - 1 ? cell.text + separator : cell.text,
    hex: cell.hex,
  }));
  return renderSegments(segments, color);
}

/**
 * Renders a `{label}{value}` line where only the value carries semantic color, per the
 * granularity rule (labels already identify what the value means).
 */
function labelValueLine(
  label: string,
  value: string,
  valueHex: string | undefined,
  color: boolean,
): string {
  return renderSegments(
    [{ text: label }, { text: value, hex: valueHex }],
    color,
  );
}

/**
 * Renders the "MODELLO REDDITI PF" declaration section (Quadro RT + Quadro RM)
 * appended to the calc output when a classification sidecar is present.
 * See docs/prd/14-dichiarazione-engine.md "CLI Output Section".
 */
function renderDichiarazione(
  report: GainsReport,
  s: LocaleStrings,
  carryForwardWasProvided: boolean,
  color: boolean,
): string {
  const d = report.dichiarazione!;
  const rt = d.quadroRT;
  const rm = d.quadroRM;
  const fmt = (n: number) => formatEUR(n, s.numberLocale);
  const lines: string[] = [];

  lines.push(SEPARATOR);
  lines.push(s.dichiarazioneHeader(d.annoImposta));
  lines.push(wholeLine(s.dichiarazioneNota, AMBER, color));
  lines.push("");

  // Quadro RT — Sezione II (redditi diversi)
  lines.push(wholeLine(s.quadroRTHeader, NAVY, color));
  lines.push(`  ${s.quadroRTPlusvalenze}  ${fmt(rt.plusvalenze)}`);
  lines.push(`  ${s.quadroRTMinusvalenze}  ${fmt(rt.minusvalenze)}`);
  lines.push(`  ${s.quadroRTDifferenza}  ${fmt(rt.differenza)}`);
  for (const entry of rt.carryForwardApplied) {
    lines.push(
      `  ${s.quadroRTRiporto(entry.annoOrigine)}  ${fmt(entry.importo)}`,
    );
  }
  let rtNLine = `  ${s.quadroRTImponibile}  ${fmt(rt.imponibileNetto)}`;
  if (rt.differenza < 0) {
    rtNLine += `   (${s.quadroRTPerdita} ${fmt(Math.abs(rt.differenza))})`;
  }
  if (rt.differenza > 0 && !carryForwardWasProvided) {
    rtNLine += ` ${s.warnNoCarryForwardProvided}`;
  }
  lines.push(rtNLine);
  lines.push(`  ${s.quadroRTImposta}  ${fmt(rt.imposta)}`);
  if (rt.differenza < 0) {
    const riportato = rt.carryForwardRiportato.reduce(
      (sum, e) => sum + e.importo,
      0,
    );
    lines.push(
      `  ${s.quadroRTRiportabile}  ${fmt(riportato)}  ${s.bucketBCarryNote}`,
    );
  }
  lines.push("");

  // Quadro RM (redditi da capitale)
  lines.push(wholeLine(s.quadroRMHeader, NAVY, color));
  if (rm.capitaleAliquota26.plusvalenze > 0) {
    lines.push(
      `  ${s.quadroRMEtf26}  ${fmt(rm.capitaleAliquota26.plusvalenze)}`,
    );
    lines.push(
      `  [RM-A1] ${s.quadroRMImposta}  ${fmt(rm.capitaleAliquota26.imposta)}`,
    );
  }
  if (rm.capitaleAliquota125.plusvalenze > 0) {
    lines.push(
      `  ${s.quadroRMBtp}  ${fmt(rm.capitaleAliquota125.plusvalenze)}`,
    );
    lines.push(
      `  [RM-A2] ${s.quadroRMImposta}  ${fmt(rm.capitaleAliquota125.imposta)}`,
    );
  }
  for (const div of rm.dividendiEsteri) {
    lines.push(
      `  ${s.quadroRMDividendi} — ${div.prodotto} (${div.isin})  ${fmt(div.lordo)}`,
    );
    lines.push(
      `  [RM-D]  ${s.quadroRMRitenuta} — ${div.prodotto} (${div.isin})  ${fmt(div.rittenutaEstera)}`,
    );
  }
  for (const c of rm.cedole) {
    lines.push(
      `  ${s.quadroRMCedole} — ${c.prodotto} (${c.isin})  ${fmt(c.importo)}`,
    );
  }
  lines.push("");

  lines.push(wholeLine(s.dichiarazioneWarningRow, AMBER, color));
  // The disclaimer is a legal notice — it must never read as a status signal, so it is
  // appended as plain text directly, never passed through renderSegments/colorize at all,
  // regardless of `color`.
  lines.push(s.dichiarazioneDisclaimer);

  return lines.join("\n");
}

export function renderReport(
  report: GainsReport,
  s: LocaleStrings,
  carryForwardWasProvided: boolean = false,
  color: boolean = false,
): string {
  const fmt = (n: number) => formatEUR(n, s.numberLocale);
  const lines: string[] = [];

  const hasBuckets = !!(report.bucketA || report.bucketB);

  // Header
  lines.push(
    `${s.headerMethod}: ${report.method} | ${s.headerTaxYear}: ${report.taxYear}`,
  );
  lines.push("");

  // Pre-table warnings (AVVISO: or WARNING:) — full sentences, whole-line amber.
  for (const w of report.warnings) {
    if (w.startsWith("AVVISO:") || w.startsWith("WARNING:")) {
      lines.push(wholeLine(w, AMBER, color));
      lines.push("");
    }
  }

  // Column headers — every header cell navy.
  const headerCells: { text: string; hex?: string }[] = [
    { text: s.headerIsin.padEnd(14), hex: NAVY },
    { text: s.headerProduct.padEnd(20), hex: NAVY },
    { text: s.headerQty.padStart(5), hex: NAVY },
    { text: s.headerBuyDate.padEnd(12), hex: NAVY },
    { text: s.headerSellDate.padEnd(12), hex: NAVY },
    { text: s.headerBuyEur.padStart(14), hex: NAVY },
    { text: s.headerSellEur.padStart(13), hex: NAVY },
    { text: s.headerGainLoss.padStart(17), hex: NAVY },
  ];
  if (hasBuckets) {
    headerCells.push({ text: s.headerBucket.padStart(8), hex: NAVY });
  }
  lines.push(joinCells(headerCells, "  ", color));

  // Lot rows — data columns unstyled, GAIN/LOSS colored by sign.
  for (const lot of report.lots) {
    const rowCells: { text: string; hex?: string }[] = [
      { text: lot.isin.padEnd(14) },
      { text: lot.product.substring(0, 20).padEnd(20) },
      { text: String(lot.quantity).padStart(5) },
      { text: lot.buyDate.padEnd(12) },
      { text: lot.sellDate.padEnd(12) },
      { text: fmt(lot.buyCostEUR).padStart(14) },
      { text: fmt(lot.sellProceedsEUR).padStart(13) },
      {
        text: formatGainLoss(lot.gainLossEUR, s.numberLocale).padStart(17),
        hex: lot.gainLossEUR >= 0 ? GREEN : RED,
      },
    ];
    if (hasBuckets) {
      rowCells.push({ text: (lot.bucket ?? "").padStart(8) });
    }
    lines.push(joinCells(rowCells, "  ", color));
  }

  lines.push("");
  lines.push(SEPARATOR);

  // Summary — value-only coloring, label stays unstyled.
  lines.push(
    labelValueLine(
      `${s.summaryPlusvalenze}:    `,
      `${fmt(report.plusvalenze)} EUR`,
      GREEN,
      color,
    ),
  );
  lines.push(
    labelValueLine(
      `${s.summaryMinusvalenze}:  `,
      `${fmt(report.minusvalenze)} EUR`,
      RED,
      color,
    ),
  );
  lines.push(
    labelValueLine(
      `${s.summaryNetResult}: `,
      `${formatGainLoss(report.netResult, s.numberLocale)} EUR`,
      report.netResult >= 0 ? GREEN : RED,
      color,
    ),
  );
  lines.push("");
  lines.push(
    labelValueLine(
      `${s.summaryWarnings}: `,
      `${report.warnings.length}`,
      report.warnings.length > 0 ? AMBER : undefined,
      color,
    ),
  );
  lines.push(`${s.summaryGenerated}: ${report.generatedAt}`);
  lines.push("");

  // Bucket A section
  if (report.bucketA && report.bucketA.groups.length > 0) {
    lines.push(SEPARATOR);
    lines.push(wholeLine(s.bucketAHeader, NAVY, color));
    lines.push(SEPARATOR);
    for (const g of report.bucketA.groups) {
      const label = g.assetClasses
        .map((ac) => assetClassLabel(ac, s))
        .join(", ");
      const rateDisplay = (g.taxRate * 100).toFixed(0);
      lines.push(
        renderSegments(
          [
            { text: `${label}: ` },
            { text: `${fmt(g.plusvalenze)} EUR → ` },
            { text: `imposta: ${fmt(g.imposta)} EUR `, hex: NAVY },
            { text: `(${rateDisplay}%)` },
          ],
          color,
        ),
      );
    }
    lines.push(
      labelValueLine(
        `${s.bucketATotalTax}: `,
        `${fmt(report.bucketA.totalImposta)} EUR`,
        NAVY,
        color,
      ),
    );
    lines.push("");
  }

  // Bucket B section
  if (report.bucketB) {
    lines.push(SEPARATOR);
    lines.push(wholeLine(s.bucketBHeader, NAVY, color));
    lines.push(SEPARATOR);
    lines.push(
      labelValueLine(
        "PLUSVALENZE: ",
        `${fmt(report.bucketB.plusvalenze)} EUR`,
        GREEN,
        color,
      ),
    );
    lines.push(
      labelValueLine(
        "MINUSVALENZE: ",
        `${fmt(report.bucketB.minusvalenze)} EUR`,
        RED,
        color,
      ),
    );
    if (report.bucketB.carryForwardApplied > 0) {
      lines.push(
        `${s.bucketBCarryApplied(0)}: ${fmt(report.bucketB.carryForwardApplied)} EUR`,
      );
    }
    const resultSegments: Segment[] = [
      { text: `${s.bucketBResult}: ` },
      {
        text: `${formatGainLoss(report.bucketB.netResult, s.numberLocale)} EUR`,
        hex: report.bucketB.netResult >= 0 ? GREEN : RED,
      },
    ];
    if (report.bucketB.carryForwardRemaining > 0) {
      resultSegments.push({ text: ` ${s.bucketBCarryNote}` });
    }
    lines.push(renderSegments(resultSegments, color));
    lines.push("");
  }

  // Mixed-buckets footnote — full sentence, whole-line amber.
  if (hasBuckets) {
    lines.push(wholeLine(s.warnMixedBuckets, AMBER, color));
    lines.push("");
  }

  if (report.dichiarazione) {
    lines.push(
      renderDichiarazione(report, s, carryForwardWasProvided, color),
    );
  } else {
    // A legal notice must never read as a status signal — always plain text, never
    // passed through renderSegments/colorize, regardless of `color`.
    lines.push(s.disclaimer);
  }

  return lines.join("\n");
}
