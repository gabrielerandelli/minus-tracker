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

export function renderReport(report: GainsReport, s: LocaleStrings): string {
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

  lines.push(s.disclaimer);

  return lines.join("\n");
}
