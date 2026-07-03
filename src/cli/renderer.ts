import type { GainsReport, AssetClass } from "../types.js";
import type { LocaleStrings } from "../i18n/types.js";

const SEPARATOR = "─".repeat(72);

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

/**
 * Renders the "MODELLO REDDITI PF" declaration section (Quadro RT + Quadro RM)
 * appended to the calc output when a classification sidecar is present.
 * See docs/prd/14-dichiarazione-engine.md "CLI Output Section".
 */
function renderDichiarazione(
  report: GainsReport,
  s: LocaleStrings,
  carryForwardWasProvided: boolean,
): string {
  const d = report.dichiarazione!;
  const rt = d.quadroRT;
  const rm = d.quadroRM;
  const fmt = (n: number) => formatEUR(n, s.numberLocale);
  const lines: string[] = [];

  lines.push(SEPARATOR);
  lines.push(s.dichiarazioneHeader(d.annoImposta));
  lines.push(s.dichiarazioneNota);
  lines.push("");

  // Quadro RT — Sezione II (redditi diversi)
  lines.push(s.quadroRTHeader);
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
  lines.push(s.quadroRMHeader);
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

  lines.push(s.dichiarazioneWarningRow);
  lines.push(s.dichiarazioneDisclaimer);

  return lines.join("\n");
}

export function renderReport(
  report: GainsReport,
  s: LocaleStrings,
  carryForwardWasProvided: boolean,
): string {
  const fmt = (n: number) => formatEUR(n, s.numberLocale);
  const lines: string[] = [];

  const hasBuckets = !!(report.bucketA || report.bucketB);

  // Header
  lines.push(
    `${s.headerMethod}: ${report.method} | ${s.headerTaxYear}: ${report.taxYear}`,
  );
  lines.push("");

  // Pre-table warnings (AVVISO: or WARNING:)
  for (const w of report.warnings) {
    if (w.startsWith("AVVISO:") || w.startsWith("WARNING:")) {
      lines.push(w);
      lines.push("");
    }
  }

  // Column headers
  const headerCols = [
    s.headerIsin.padEnd(14),
    s.headerProduct.padEnd(20),
    s.headerQty.padStart(5),
    s.headerBuyDate.padEnd(12),
    s.headerSellDate.padEnd(12),
    s.headerBuyEur.padStart(14),
    s.headerSellEur.padStart(13),
    s.headerGainLoss.padStart(17),
  ];
  if (hasBuckets) {
    headerCols.push(s.headerBucket.padStart(8));
  }
  lines.push(headerCols.join("  "));

  // Lot rows
  for (const lot of report.lots) {
    const rowCols = [
      lot.isin.padEnd(14),
      lot.product.substring(0, 20).padEnd(20),
      String(lot.quantity).padStart(5),
      lot.buyDate.padEnd(12),
      lot.sellDate.padEnd(12),
      fmt(lot.buyCostEUR).padStart(14),
      fmt(lot.sellProceedsEUR).padStart(13),
      formatGainLoss(lot.gainLossEUR, s.numberLocale).padStart(17),
    ];
    if (hasBuckets) {
      rowCols.push((lot.bucket ?? "").padStart(8));
    }
    lines.push(rowCols.join("  "));
  }

  lines.push("");
  lines.push(SEPARATOR);

  // Summary
  lines.push(`${s.summaryPlusvalenze}:    ${fmt(report.plusvalenze)} EUR`);
  lines.push(`${s.summaryMinusvalenze}:  ${fmt(report.minusvalenze)} EUR`);
  lines.push(`${s.summaryNetResult}: ${fmt(report.netResult)} EUR`);
  lines.push("");
  lines.push(`${s.summaryWarnings}: ${report.warnings.length}`);
  lines.push(`${s.summaryGenerated}: ${report.generatedAt}`);
  lines.push("");

  // Bucket A section
  if (report.bucketA && report.bucketA.groups.length > 0) {
    lines.push(SEPARATOR);
    lines.push(s.bucketAHeader);
    lines.push(SEPARATOR);
    for (const g of report.bucketA.groups) {
      const label = g.assetClasses
        .map((ac) => assetClassLabel(ac, s))
        .join(", ");
      const rateDisplay = (g.taxRate * 100).toFixed(0);
      lines.push(
        `${label}: ${fmt(g.plusvalenze)} EUR → imposta: ${fmt(g.imposta)} EUR (${rateDisplay}%)`,
      );
    }
    lines.push(`${s.bucketATotalTax}: ${fmt(report.bucketA.totalImposta)} EUR`);
    lines.push("");
  }

  // Bucket B section
  if (report.bucketB) {
    lines.push(SEPARATOR);
    lines.push(s.bucketBHeader);
    lines.push(SEPARATOR);
    lines.push(`PLUSVALENZE: ${fmt(report.bucketB.plusvalenze)} EUR`);
    lines.push(`MINUSVALENZE: ${fmt(report.bucketB.minusvalenze)} EUR`);
    if (report.bucketB.carryForwardApplied > 0) {
      lines.push(
        `${s.bucketBCarryApplied(0)}: ${fmt(report.bucketB.carryForwardApplied)} EUR`,
      );
    }
    let resultLine = `${s.bucketBResult}: ${fmt(report.bucketB.netResult)} EUR`;
    if (report.bucketB.carryForwardRemaining > 0) {
      resultLine += ` ${s.bucketBCarryNote}`;
    }
    lines.push(resultLine);
    lines.push("");
  }

  // Mixed-buckets footnote
  if (hasBuckets) {
    lines.push(s.warnMixedBuckets);
    lines.push("");
  }

  if (report.dichiarazione) {
    lines.push(renderDichiarazione(report, s, carryForwardWasProvided));
  } else {
    lines.push(s.disclaimer);
  }

  return lines.join("\n");
}
