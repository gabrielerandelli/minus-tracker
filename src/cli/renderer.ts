import type { GainsReport, MatchedLot } from "../types.js";
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

export function renderReport(report: GainsReport, s: LocaleStrings): string {
  const fmt = (n: number) => formatEUR(n, s.numberLocale);
  const lines: string[] = [];

  // Header
  lines.push(
    `${s.headerMethod}: ${report.method} | ${s.headerTaxYear}: ${report.taxYear}`,
  );
  lines.push("");

  // Column headers
  const headers = [
    s.headerIsin.padEnd(14),
    s.headerProduct.padEnd(20),
    s.headerQty.padStart(5),
    s.headerBuyDate.padEnd(12),
    s.headerSellDate.padEnd(12),
    s.headerBuyEur.padStart(14),
    s.headerSellEur.padStart(13),
    s.headerGainLoss.padStart(17),
  ].join("  ");
  lines.push(headers);

  // Lot rows
  for (const lot of report.lots) {
    const row = [
      lot.isin.padEnd(14),
      lot.product.substring(0, 20).padEnd(20),
      String(lot.quantity).padStart(5),
      lot.buyDate.padEnd(12),
      lot.sellDate.padEnd(12),
      fmt(lot.buyCostEUR).padStart(14),
      fmt(lot.sellProceedsEUR).padStart(13),
      formatGainLoss(lot.gainLossEUR, s.numberLocale).padStart(17),
    ].join("  ");
    lines.push(row);
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
  lines.push(s.disclaimer);

  return lines.join("\n");
}
