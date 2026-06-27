/**
 * CLI runner for minus-tracker stress test scenarios
 * Executes CLI commands against generated CSV files and collects results.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ManifestScenario } from "./generator.js";

/**
 * Result of running a single CLI command
 */
export interface CommandResult {
  cmd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  pass: boolean;
  failure?: string;
}

/**
 * Result of running all commands for a scenario
 */
export interface ScenarioResult {
  id: string;
  category: string;
  slug: string;
  description: string;
  csvFile: string;
  results: CommandResult[];
  pass: boolean;
  warningCheckPass: boolean;
  expectedWarningCount: number;
  actualWarningCount: number;
}

/**
 * Count warning lines in text (lines containing ⚠, WARNING, WARN, avviso, or attenzione)
 */
function countWarnings(text: string): number {
  if (!text) return 0;
  const lines = text.split("\n");
  return lines.filter((line) => /⚠|warning|warn|avviso|attenzione/i.test(line))
    .length;
}

/**
 * Check if a string is valid JSON with required keys
 */
function isValidJson(jsonStr: string): boolean {
  try {
    const obj = JSON.parse(jsonStr);
    return (
      typeof obj === "object" &&
      obj !== null &&
      "plusvalenze" in obj &&
      "minusvalenze" in obj &&
      "lots" in obj
    );
  } catch {
    return false;
  }
}

/**
 * Run a single CLI command and return its result
 */
function runCommand(
  cliBin: string,
  args: string[],
  cmdLabel: string,
  expectedExitCode: number,
  outputShapeCheck: (
    stdout: string,
    stderr: string,
    exitCode: number,
  ) => { valid: boolean; reason?: string },
): CommandResult {
  // Determine how to invoke the CLI
  const isJsFile = cliBin.endsWith(".js");
  let result;

  if (isJsFile) {
    // Run: node <cliBin> <args>
    result = spawnSync("node", [cliBin, ...args], {
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, MINUS_TRACKER_LANG: undefined },
    });
  } else {
    // Run: <cliBin> <args> (directly executable)
    result = spawnSync(cliBin, args, {
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, MINUS_TRACKER_LANG: undefined },
    });
  }

  const exitCode = result.status ?? 1; // null status (timeout/error) → treat as 1
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";

  // Check exit code match
  const exitCodeMatch = exitCode === expectedExitCode;

  // Check output shape
  const shapeCheck = outputShapeCheck(stdout, stderr, exitCode);

  let pass = exitCodeMatch && shapeCheck.valid;
  let failure: string | undefined;

  if (!exitCodeMatch) {
    failure = `exit code mismatch: expected ${expectedExitCode}, got ${exitCode}`;
  } else if (!shapeCheck.valid) {
    failure = shapeCheck.reason;
  }

  return {
    cmd: cmdLabel,
    exitCode,
    stdout,
    stderr,
    pass,
    failure,
  };
}

/**
 * Run all CLI commands for a scenario and return the result
 */
export function runScenario(
  scenario: ManifestScenario,
  csvContent: string,
  outputDir: string,
  cliBin: string,
): ScenarioResult {
  // Write CSV to temp file
  const csvFileName = `${scenario.id}-${scenario.slug}.csv`;
  const csvFile = join(outputDir, csvFileName);
  writeFileSync(csvFile, csvContent, "utf8");

  const results: CommandResult[] = [];

  // Run calc command (LIFO)
  results.push(
    runCommand(
      cliBin,
      ["calc", csvFile],
      "calc",
      scenario.expect.calc_exit,
      (stdout) => {
        if (scenario.expect.calc_exit === 0) {
          const hasPlus = /plusvalenze|plusvalues/i.test(stdout);
          return hasPlus
            ? { valid: true }
            : {
                valid: false,
                reason: "calc output missing plusvalenze/plusvalues (exit 0)",
              };
        }
        return { valid: true };
      },
    ),
  );

  // Run calc --method FIFO
  results.push(
    runCommand(
      cliBin,
      ["calc", "--method", "FIFO", csvFile],
      "calc --method FIFO",
      scenario.expect.fifo_exit,
      (stdout) => {
        if (scenario.expect.fifo_exit === 0) {
          const hasPlus = /plusvalenze|plusvalues/i.test(stdout);
          return hasPlus
            ? { valid: true }
            : {
                valid: false,
                reason:
                  "calc --method FIFO output missing plusvalenze/plusvalues (exit 0)",
              };
        }
        return { valid: true };
      },
    ),
  );

  // Run calc --json
  results.push(
    runCommand(
      cliBin,
      ["calc", "--json", csvFile],
      "calc --json",
      scenario.expect.json_exit,
      (stdout) => {
        if (scenario.expect.json_exit === 0) {
          const isValid = isValidJson(stdout);
          return isValid
            ? { valid: true }
            : {
                valid: false,
                reason:
                  "calc --json output is not valid JSON with required keys (exit 0)",
              };
        }
        return { valid: true };
      },
    ),
  );

  // Run calc --lang en
  results.push(
    runCommand(
      cliBin,
      ["calc", "--lang", "en", csvFile],
      "calc --lang en",
      scenario.expect.en_exit,
      (stdout) => {
        if (scenario.expect.en_exit === 0) {
          const nonEmpty = stdout.trim().length > 0;
          return nonEmpty
            ? { valid: true }
            : {
                valid: false,
                reason: "calc --lang en output is empty (exit 0)",
              };
        }
        return { valid: true };
      },
    ),
  );

  // Run validate
  results.push(
    runCommand(
      cliBin,
      ["validate", csvFile],
      "validate",
      scenario.expect.validate_exit,
      (stdout) => {
        if (scenario.expect.validate_exit !== 0) return { valid: true };
        const nonEmpty = stdout.trim().length > 0;
        return nonEmpty
          ? { valid: true }
          : {
              valid: false,
              reason: "validate output is empty",
            };
      },
    ),
  );

  // Count warnings using English locale calc output (immune to locale config)
  // English output emits "WARNINGS: N" which matches the /warn/i pattern reliably
  const enCalcResult = results[3]; // calc --lang en is always index 3
  const actualWarningCount = countWarnings(enCalcResult.stdout);
  const warningCheckPass = actualWarningCount >= scenario.expect.warning_count;

  // Determine overall pass
  const pass = results.every((r) => r.pass) && warningCheckPass;

  return {
    id: scenario.id,
    category: scenario.category,
    slug: scenario.slug,
    description: scenario.description,
    csvFile,
    results,
    pass,
    warningCheckPass,
    expectedWarningCount: scenario.expect.warning_count,
    actualWarningCount,
  };
}
