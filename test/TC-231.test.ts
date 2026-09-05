import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { runValidate } from "../src/cli/commands/validate.js";
import { runClassify } from "../src/cli/commands/classify.js";
import { runRates } from "../src/cli/commands/rates.js";
import { runConfig } from "../src/cli/commands/config.js";
import { buildReport, formatTable } from "../src/stress/reporter.js";
import type { ScenarioResult } from "../src/stress/runner.js";
import { it as itStrings } from "../src/i18n/it.js";
import { stripAnsi } from "../src/cli/colors.js";

/**
 * Task 63 acceptance test — written but NOT executed, per explicit instruction
 * (2026-09-05 spec-pipeline-execute run for spec-plan/b2373c7). See
 * docs/new-workflow-problems.md in minus-tracker-dev. Run this before trusting
 * it — it has never been executed and may need adjustment.
 *
 * TC-231: for each of calc/validate/classify/rates/config/stress-test,
 * stripAnsi(coloredRun) === noColorRun — proving color is styling-only.
 *
 * Each command reuses the simplest fixture/invocation this repo's own
 * *-color.test.ts files already established for it, so this is a thin
 * cross-cutting assembly rather than new fixture design:
 *  - calc/validate: fixtures/valid-trades.csv (calc-color.test.ts)
 *  - classify: the no-TTY/no-offline precondition error (classify-color.test.ts's
 *    TC-220 case) — the simplest deterministic classify path, no OpenFIGI call
 *  - rates: `--check` (rates-color.test.ts) — no network
 *  - config: `--show` (config-color.test.ts)
 *  - stress-test: reporter.ts's buildReport()/formatTable() directly, exactly
 *    as stress-color.test.ts does, rather than a full runStressTest() spawn
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tc231-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

function makeWritable(): { stream: Writable; output: () => string } {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { stream, output: () => buf };
}

describe("TC-231: stripAnsi(colored) === uncolored, for every command", () => {
  it("calc", async () => {
    const dir = makeTmpDir();
    const fixturePath = path.join(dir, "valid-trades.csv");
    fs.copyFileSync(
      path.join(__dirname, "fixtures/valid-trades.csv"),
      fixturePath,
    );

    const normalize = (s: string) => s.replace(/Generato: .+/, "Generato: <ts>");
    const colored = makeWritable();
    await runCalc([fixturePath], {}, itStrings, colored.stream, makeWritable().stream, true);
    const uncolored = makeWritable();
    await runCalc([fixturePath], {}, itStrings, uncolored.stream, makeWritable().stream, false);

    expect(normalize(stripAnsi(colored.output()))).toBe(
      normalize(uncolored.output()),
    );
  });

  it("validate", async () => {
    const dir = makeTmpDir();
    const fixturePath = path.join(dir, "valid-trades.csv");
    fs.copyFileSync(
      path.join(__dirname, "fixtures/valid-trades.csv"),
      fixturePath,
    );

    const colored = makeWritable();
    await runValidate(
      [fixturePath],
      {},
      itStrings,
      colored.stream,
      makeWritable().stream,
      true,
    );
    const uncolored = makeWritable();
    await runValidate(
      [fixturePath],
      {},
      itStrings,
      uncolored.stream,
      makeWritable().stream,
      false,
    );

    expect(stripAnsi(colored.output())).toBe(uncolored.output());
  });

  it("classify (no-TTY precondition error — deterministic, no OpenFIGI call)", async () => {
    const coloredErr = makeWritable();
    await runClassify(
      ["some-file.csv"],
      {},
      itStrings,
      makeWritable().stream,
      coloredErr.stream,
      true,
    );
    const uncoloredErr = makeWritable();
    await runClassify(
      ["some-file.csv"],
      {},
      itStrings,
      makeWritable().stream,
      uncoloredErr.stream,
      false,
    );

    expect(stripAnsi(coloredErr.output())).toBe(uncoloredErr.output());
  });

  it("rates --check (no network)", async () => {
    const colored = makeWritable();
    await runRates(
      [],
      { check: true },
      itStrings,
      colored.stream,
      makeWritable().stream,
      true,
    );
    const uncolored = makeWritable();
    await runRates(
      [],
      { check: true },
      itStrings,
      uncolored.stream,
      makeWritable().stream,
      false,
    );

    expect(stripAnsi(colored.output())).toBe(uncolored.output());
  });

  it("config --show", async () => {
    const colored = makeWritable();
    await runConfig(
      [],
      { show: true },
      itStrings,
      colored.stream,
      makeWritable().stream,
      true,
    );
    const uncolored = makeWritable();
    await runConfig(
      [],
      { show: true },
      itStrings,
      uncolored.stream,
      makeWritable().stream,
      false,
    );

    expect(stripAnsi(colored.output())).toBe(uncolored.output());
  });

  it("stress-test (reporter.ts formatTable(), directly — same approach as stress-color.test.ts)", () => {
    const result: ScenarioResult = {
      id: "001",
      category: "01-eur-gains",
      slug: "test",
      description: "Test scenario",
      csvFile: "/tmp/test.csv",
      results: [
        { cmd: "calc", exitCode: 0, stdout: "", stderr: "", pass: true },
      ],
      pass: true,
      warningCheckPass: true,
      expectedWarningCount: 0,
      actualWarningCount: 0,
    };
    const report = buildReport([result], 1, 0);

    const colored = formatTable(report, true);
    const uncolored = formatTable(report, false);

    expect(stripAnsi(colored)).toBe(uncolored);
  });
});
