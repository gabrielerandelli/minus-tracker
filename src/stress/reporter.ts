/**
 * Reporter for minus-tracker stress test suite.
 * Formats stress test results into human-readable table + summary.
 */

import type { ScenarioResult } from "./runner.js";
import { renderSegments } from "../cli/colors.js";
import type { Segment } from "../cli/colors.js";

// Part 18 palette (docs/prd/18-cli-color-output.md) — navy for headers/labels,
// green/red for the pass/fail verdict signal.
const NAVY = "#1B4965";
const GREEN = "#4ADE80";
const RED = "#F87171";

/**
 * Aggregated stress test report
 */
export interface StressReport {
  totalScenarios: number;
  passed: number;
  failed: number;
  results: ScenarioResult[];
  rangeStart: number; // 1-based
  rangeEnd: number;
}

/**
 * Aggregates a list of ScenarioResult into a StressReport
 */
export function buildReport(
  results: ScenarioResult[],
  rangeStart: number,
  rangeEnd: number,
): StressReport {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;

  return {
    totalScenarios: results.length,
    passed,
    failed,
    results,
    rangeStart,
    rangeEnd,
  };
}

/**
 * Format a ScenarioResult as a JSON string
 */
export function formatJson(report: StressReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Format a StressReport as a human-readable ASCII table.
 *
 * `color` defaults to false so existing callers/tests (which never pass a
 * TTY) keep getting byte-identical plain output.
 */
export function formatTable(report: StressReport, color: boolean = false): string {
  const lines: string[] = [];

  // Header — mixes a pass count and a fail count in one sentence, so per
  // the granularity rule it stays neutral/unstyled rather than picking one
  // verdict color for a two-signal line (same treatment as calc's own
  // METHOD/TAX YEAR header).
  lines.push("STRESS TEST — minus-tracker");
  lines.push(
    `Scenari: ${report.totalScenarios}  |  Passati: ${report.passed}  |  Falliti: ${report.failed}`,
  );
  lines.push("");

  // Column header — all four cells navy, same as calc's table headers.
  const idCol = "ID";
  const categoryCol = "CATEGORIA";
  const descCol = "DESCRIZIONE";
  const resultCol = "ESITO";

  lines.push(
    formatRow(idCol, categoryCol, descCol, resultCol, color, {
      id: NAVY,
      category: NAVY,
      description: NAVY,
      esito: NAVY,
    }),
  );

  // Rows for each scenario
  for (const result of report.results) {
    const idStr = result.id.padStart(3, "0");
    const status = result.pass ? "✓ PASS" : "✗ FAIL";

    lines.push(
      formatRow(idStr, result.category, result.description, status, color, {
        // ID/CATEGORIA/DESCRIZIONE stay unstyled for data rows — only ESITO
        // carries the pass/fail verdict color.
        esito: result.pass ? GREEN : RED,
      }),
    );

    // If failed, add failure details
    if (!result.pass) {
      for (const cmdResult of result.results) {
        if (!cmdResult.pass) {
          if (cmdResult.failure) {
            let failureText = "";

            // Check for exit code mismatch pattern
            if (cmdResult.failure.includes("exit code mismatch")) {
              const match = cmdResult.failure.match(
                /expected (\d+), got (\d+)/,
              );
              if (match) {
                failureText = `atteso exit ${match[1]}, ottenuto exit ${match[2]}`;
              }
            } else {
              // Output shape check failed
              failureText = `output shape non valido — ${cmdResult.failure}`;
            }

            // Sub-detail under an already-red-glyphed failed scenario — not
            // a new signal, so it stays unstyled.
            lines.push(`   → ${cmdResult.cmd}: ${failureText}`);
          }
        }
      }

      // Check warning count — same unstyled sub-detail treatment.
      if (!result.warningCheckPass) {
        lines.push(
          `   → avvertenze: attese ≥${result.expectedWarningCount}, trovate ${result.actualWarningCount}`,
        );
      }
    }
  }

  // Summary footer — label unstyled, value colored, zero-is-neutral (same
  // pattern as calc's WARNINGS: <n>).
  lines.push("");
  lines.push(
    renderSegments(
      [
        { text: "PASSATI: " },
        { text: String(report.passed), hex: report.passed > 0 ? GREEN : undefined },
      ],
      color,
    ),
  );
  lines.push(
    renderSegments(
      [
        { text: "FALLITI: " },
        { text: String(report.failed), hex: report.failed > 0 ? RED : undefined },
      ],
      color,
    ),
  );
  lines.push("");

  return lines.join("\n");
}

/** Optional per-column color for one `formatRow()` call. */
interface RowColors {
  id?: string;
  category?: string;
  description?: string;
  esito?: string;
}

/**
 * Format a single table row with fixed column widths.
 *
 * Widths are computed on the plain (unpadded, uncolored) column text first;
 * only the already-sized strings are handed to `renderSegments()`, which
 * wraps each in color at the end — the padding-before-color invariant.
 */
function formatRow(
  id: string,
  category: string,
  description: string,
  esito: string,
  color: boolean,
  colors: RowColors = {},
): string {
  // Column widths: ID=4, CATEGORIA=22, DESCRIZIONE=40, ESITO=8
  const idWidth = 4;
  const categoryWidth = 22;
  const descWidth = 40;
  const esitoWidth = 8;

  // Pad/truncate columns
  const idCol = id.padEnd(idWidth);
  const categoryCol = truncateOrPad(category, categoryWidth);
  const descCol = truncateOrPad(description, descWidth);
  const esitoCol = esito.padEnd(esitoWidth);

  const segments: Segment[] = [
    { text: idCol, hex: colors.id },
    { text: "  " },
    { text: categoryCol, hex: colors.category },
    { text: "  " },
    { text: descCol, hex: colors.description },
    { text: "  " },
    { text: esitoCol, hex: colors.esito },
  ];

  return renderSegments(segments, color);
}

/**
 * Truncate a string to max width with ".." suffix, or pad to width
 */
function truncateOrPad(str: string, maxWidth: number): string {
  if (str.length > maxWidth) {
    return str.slice(0, maxWidth - 2) + "..";
  }
  return str.padEnd(maxWidth);
}
