/**
 * Reporter for minus-tracker stress test suite.
 * Formats stress test results into human-readable table + summary.
 */

import type { ScenarioResult } from "./runner.js";

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
export function formatTable(report: StressReport): string {
  const lines: string[] = [];

  // Header
  lines.push("STRESS TEST — minus-tracker");
  lines.push(
    `Scenari: ${report.totalScenarios}  |  Passati: ${report.passed}  |  Falliti: ${report.failed}`,
  );
  lines.push("");

  // Column header
  const idCol = "ID";
  const categoryCol = "CATEGORIA";
  const descCol = "DESCRIZIONE";
  const resultCol = "ESITO";

  lines.push(formatRow(idCol, categoryCol, descCol, resultCol));

  // Rows for each scenario
  for (const result of report.results) {
    const idStr = result.id.padStart(3, "0");
    const status = result.pass ? "✓ PASS" : "✗ FAIL";

    lines.push(formatRow(idStr, result.category, result.description, status));

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

  // Summary footer
  lines.push("");
  lines.push(`PASSATI: ${report.passed}`);
  lines.push(`FALLITI: ${report.failed}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Format a single table row with fixed column widths
 */
function formatRow(
  id: string,
  category: string,
  description: string,
  esito: string,
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

  return `${idCol}  ${categoryCol}  ${descCol}  ${esitoCol}`;
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
