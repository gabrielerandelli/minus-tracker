import type { GainsReport, AssetClass } from "../types.js";
import type { LocaleStrings } from "../i18n/types.js";
import { renderSegments, type Segment } from "./colors.js";

const SEPARATOR = "─".repeat(72);

// Part 18 palette (see docs/prd/18-cli-color-output.md).
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

/** Green when `amount >= 0`, red otherwise — the shared sign-color rule. */
function signColor(amount: number): string {
  return amount >= 0 ? GREEN : RED;
}

function assetClassLabel(ac: AssetClass, s: LocaleStrings): string {
  if (ac === "ETF") return s.bucketAEtf;
  if (ac === "GovtBondWL" || ac === "GovtBondOther") return s.bucketABtpWl;
  return ac;
}

/**
 * Joins `cells` with `sep` (an unstyled separator segment), preserving each
 * cell's own `hex`. Keeps every row/line built as a single `Segment[]` that
 * `renderSegments()` can then render in one pass.
 */
function joinCells(cells: Segment[], sep: string): Segment[] {
  const out: Segment[] = [];
  cells.forEach((cell, i) => {
    if (i > 0) out.push({ text: sep });
    out.push(cell);
  });
  return out;
}

/** Renders a full sentence with no isolable value as one colored segment. */
function wholeLine(text: string, hex: string | undefined, color: boolean): string {
  return renderSegments([{ text, hex }], color);
}

/**
 * Renders the "MODELLO REDDITI PF" declaration section (Quadro RT + Quadro RM)
 * appended to the calc output when a classification sidecar is present.
 * See docs/prd/14-dichiarazione-engine.md "CLI Output Section" and
 * docs/prd/18-cli-color-output.md for the coloring rules applied here.
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
  // Always unstyled — a legal notice must never read as a status signal —
  // so it is appended as a plain string, never passed through renderSegments.
  lines.push(s.dichiarazioneDisclaimer);

  return lines.join("\n");
}

export function renderReport(
  report: GainsReport,
  s: LocaleStrings,
  carryForwardWasProvided: boolean,
  color = false,
): string {
  const fmt = (n: number) => formatEUR(n, s.numberLocale);
  const lines: string[] = [];

  const hasBuckets = !!(report.bucketA || report.bucketB);

  // Header — mixes method and tax year, neither of which is a semantic
  // gain/loss/warning signal, so it stays fully unstyled (Part 18 Architecture
  // "line that mixes multiple different-signal ... stays unstyled").
  lines.push(
    `${s.headerMethod}: ${report.method} | ${s.headerTaxYear}: ${report.taxYear}`,
  );
  lines.push("");

  // Pre-table warnings (AVVISO: or WARNING:) — whole-line amber.
  for (const w of report.warnings) {
    if (w.startsWith("AVVISO:") || w.startsWith("WARNING:")) {
      lines.push(wholeLine(w, AMBER, color));
      lines.push("");
    }
  }

  // Column headers — every cell navy.
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
  const headerSegs: Segment[] = headerCols.map((text) => ({
    text,
    hex: NAVY,
  }));
  lines.push(renderSegments(joinCells(headerSegs, "  "), color));

  // Lot rows — data columns unstyled, GAIN/LOSS colored by sign.
  for (const lot of report.lots) {
    const rowSegs: Segment[] = [
      { text: lot.isin.padEnd(14) },
      { text: lot.product.substring(0, 20).padEnd(20) },
      { text: String(lot.quantity).padStart(5) },
      { text: lot.buyDate.padEnd(12) },
      { text: lot.sellDate.padEnd(12) },
      { text: fmt(lot.buyCostEUR).padStart(14) },
      { text: fmt(lot.sellProceedsEUR).padStart(13) },
      {
        text: formatGainLoss(lot.gainLossEUR, s.numberLocale).padStart(17),
        hex: signColor(lot.gainLossEUR),
      },
    ];
    if (hasBuckets) {
      rowSegs.push({ text: (lot.bucket ?? "").padStart(8) });
    }
    lines.push(renderSegments(joinCells(rowSegs, "  "), color));
  }

  lines.push("");
  lines.push(SEPARATOR);

  // Summary — value-only coloring per the granularity rule.
  lines.push(
    renderSegments(
      [
        { text: `${s.summaryPlusvalenze}:    ` },
        { text: `${fmt(report.plusvalenze)} EUR`, hex: GREEN },
      ],
      color,
    ),
  );
  lines.push(
    renderSegments(
      [
        { text: `${s.summaryMinusvalenze}:  ` },
        { text: `${fmt(report.minusvalenze)} EUR`, hex: RED },
      ],
      color,
    ),
  );
  // NET RESULT switches from plain formatEUR to formatGainLoss-style signed
  // output — the one intentional output-byte change this feature makes
  // (TC-209), on top of the value-only coloring.
  lines.push(
    renderSegments(
      [
        { text: `${s.summaryNetResult}: ` },
        {
          text: `${formatGainLoss(report.netResult, s.numberLocale)} EUR`,
          hex: signColor(report.netResult),
        },
      ],
      color,
    ),
  );
  lines.push("");
  lines.push(
    renderSegments(
      [
        { text: `${s.summaryWarnings}: ` },
        {
          text: `${report.warnings.length}`,
          hex: report.warnings.length > 0 ? AMBER : undefined,
        },
      ],
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
            {
              text: `imposta: ${fmt(g.imposta)} EUR`,
              hex: NAVY,
            },
            { text: ` (${rateDisplay}%)` },
          ],
          color,
        ),
      );
    }
    lines.push(
      renderSegments(
        [
          { text: `${s.bucketATotalTax}: ` },
          { text: `${fmt(report.bucketA.totalImposta)} EUR`, hex: NAVY },
        ],
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
      renderSegments(
        [
          { text: "PLUSVALENZE: " },
          { text: `${fmt(report.bucketB.plusvalenze)} EUR`, hex: GREEN },
        ],
        color,
      ),
    );
    lines.push(
      renderSegments(
        [
          { text: "MINUSVALENZE: " },
          { text: `${fmt(report.bucketB.minusvalenze)} EUR`, hex: RED },
        ],
        color,
      ),
    );
    if (report.bucketB.carryForwardApplied > 0) {
      lines.push(
        `${s.bucketBCarryApplied(0)}: ${fmt(report.bucketB.carryForwardApplied)} EUR`,
      );
    }
    // Bucket B result line mirrors NET RESULT: signed + colored by sign
    // (TC-215, the same sign fix as TC-209).
    const resultSegs: Segment[] = [
      { text: `${s.bucketBResult}: ` },
      {
        text: `${formatGainLoss(report.bucketB.netResult, s.numberLocale)} EUR`,
        hex: signColor(report.bucketB.netResult),
      },
    ];
    if (report.bucketB.carryForwardRemaining > 0) {
      resultSegs.push({ text: ` ${s.bucketBCarryNote}` });
    }
    lines.push(renderSegments(resultSegs, color));
    lines.push("");
  }

  // Mixed-buckets footnote — whole-line amber.
  if (hasBuckets) {
    lines.push(wholeLine(s.warnMixedBuckets, AMBER, color));
    lines.push("");
  }

  if (report.dichiarazione) {
    lines.push(
      renderDichiarazione(report, s, carryForwardWasProvided, color),
    );
  } else {
    // Always unstyled — a legal notice must never read as a status signal —
    // so it is appended as a plain string, never passed through renderSegments.
    lines.push(s.disclaimer);
  }

  return lines.join("\n");
}
