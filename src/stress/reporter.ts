/**
 * Reporter for minus-tracker stress test suite.
 * Formats stress test results into human-readable table + summary.
 */

import type { ScenarioResult } from "./runner.js";
import { renderSegments, type Segment } from "../cli/colors.js";

// Palette (Part 18) — mirrors src/cli/renderer.ts's palette for the three roles
// stress-test's table/footer actually use: navy for the header row, green/red for the
// per-verdict ESITO cell and the PASSATI:/FALLITI: footer values.
const NAVY = "#1B4965";
const GREEN = "#4ADE80";
const RED = "#F87171";

/** Renders a single whole-line segment (no cell/value split), e.g. the navy header row. */
function wholeLine(text: string, hex: string | undefined, color: boolean): string {
  return renderSegments([{ text, hex }], color);
}

/**
 * Renders a `{label}{value}` line where only the value carries semantic color — mirrors
 * renderer.ts's labelValueLine, used here for the PASSATI:/FALLITI: footer.
 */
function labelValueLine(
  label: string,
  value: string,
  valueHex: string | undefined,
  color: boolean,
): string {
  return renderSegments([{ text: label }, { text: value, hex: valueHex }], color);
}

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
 * Format a StressReport as a human-readable ASCII table
 */
export function formatTable(report: StressReport, color: boolean = false): string {
  const lines: string[] = [];

  // Header
  lines.push("STRESS TEST — minus-tracker");
  // Two-signal recap line (Scenari/Passati/Falliti all in one line) — the granularity rule's
  // two-signal-line exception: rendered plain/unstyled regardless of pass/fail mix (TC-225).
  lines.push(
    `Scenari: ${report.totalScenarios}  |  Passati: ${report.passed}  |  Falliti: ${report.failed}`,
  );
  lines.push("");

  // Column header — built as plain text first (esitoHex omitted, color forced off), then the
  // whole padded row is wrapped in one navy segment, so all four header cells (including
  // ESITO's own header label) read navy alike, distinct from data rows where only the ESITO
  // cell is colored.
  const idCol = "ID";
  const categoryCol = "CATEGORIA";
  const descCol = "DESCRIZIONE";
  const resultCol = "ESITO";

  lines.push(
    wholeLine(
      formatRow(idCol, categoryCol, descCol, resultCol, undefined, false),
      NAVY,
      color,
    ),
  );

  // Rows for each scenario — ID/CATEGORIA/DESCRIZIONE stay unstyled; only ESITO is colored,
  // by verdict (TC-227). Column widths are computed on the plain text in formatRow before any
  // segment/color wrapping happens, preserving the padding-before-color invariant.
  for (const result of report.results) {
    const idStr = result.id.padStart(3, "0");
    const status = result.pass ? "✓ PASS" : "✗ FAIL";

    lines.push(
      formatRow(
        idStr,
        result.category,
        result.description,
        status,
        result.pass ? GREEN : RED,
        color,
      ),
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

            lines.push(`   → ${cmdResult.cmd}: ${failureText}`);
          }
        }
      }

      // Check warning count
      if (!result.warningCheckPass) {
        lines.push(
          `   → avvertenze: attese ≥${result.expectedWarningCount}, trovate ${result.actualWarningCount}`,
        );
      }
    }
  }

  // Summary footer — label unstyled, value hex conditional: PASSATI is always green;
  // FALLITI is red only when > 0, else unstyled (zero-is-neutral, same pattern as calc's
  // WARNINGS: <n> — TC-228).
  lines.push("");
  lines.push(labelValueLine("PASSATI: ", `${report.passed}`, GREEN, color));
  lines.push(
    labelValueLine(
      "FALLITI: ",
      `${report.failed}`,
      report.failed > 0 ? RED : undefined,
      color,
    ),
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Format a single table row with fixed column widths. Only the ESITO cell ever carries color
 * (`esitoHex`) — ID/CATEGORIA/DESCRIZIONE never receive a hex on any row, including the header
 * (the header's own uniform navy comes from formatTable wrapping this function's plain output
 * in one whole-line segment, not from a per-cell hex here). Column widths are computed on the
 * plain text below before any segment is built, preserving the padding-before-color invariant.
 */
function formatRow(
  id: string,
  category: string,
  description: string,
  esito: string,
  esitoHex: string | undefined,
  color: boolean,
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
    { text: `${idCol}  ` },
    { text: `${categoryCol}  ` },
    { text: `${descCol}  ` },
    { text: esitoCol, hex: esitoHex },
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
