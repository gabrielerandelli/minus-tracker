import { describe, it, expect, vi } from "vitest";
import { Writable } from "node:stream";
import { buildReport, formatTable } from "../src/stress/reporter.js";
import type { StressReport } from "../src/stress/reporter.js";
import type { ScenarioResult } from "../src/stress/runner.js";
import { stripAnsi } from "../src/cli/colors.js";

/**
 * Task 62: `stress-test` — reporter.ts Segment rewrite + command coloring.
 *
 * TC-225: recap header (`Scenari: X | Passati: Y | Falliti: Z`) stays unstyled/navy
 *   regardless of pass/fail mix (the granularity rule's two-signal-line exception).
 * TC-226: per-scenario `[✓]`/`[✗]` progress line colored by its own glyph — green/red,
 *   never teal.
 * TC-227: `formatTable()`'s `ESITO` column colored by verdict; ID/CATEGORIA/DESCRIZIONE
 *   and the whole header row stay unstyled/navy; column widths unchanged after stripping
 *   color (padding-before-color invariant).
 * TC-228: `PASSATI:`/`FALLITI:` footer follows the zero-is-neutral rule (PASSATI always
 *   green; FALLITI red only when > 0).
 * TC-229: setup `Warning: rates --check failed...`/`Warning: config --show failed.` lines
 *   are amber; the `Note: --output-dir...` line is unstyled.
 */

const NAVY = "\x1b[38;2;27;73;101m"; // #1B4965
const GREEN = "\x1b[38;2;74;222;128m"; // #4ADE80
const RED = "\x1b[38;2;248;113;113m"; // #F87171
const AMBER = "\x1b[38;2;251;191;36m"; // #FBBF24
const TEAL = "\x1b[38;2;45;212;191m"; // #2DD4BF

function makeResult(id: string, pass: boolean): ScenarioResult {
  return {
    id,
    category: "01-eur-gains",
    slug: "test",
    description: "Test scenario",
    csvFile: "/tmp/test.csv",
    results: [
      {
        cmd: "calc",
        exitCode: pass ? 0 : 1,
        stdout: "",
        stderr: "",
        pass,
        ...(pass ? {} : { failure: "expected exit 0, got exit 1" }),
      },
    ],
    pass,
    warningCheckPass: true,
    expectedWarningCount: 0,
    actualWarningCount: 0,
  };
}

function makeWritable(): { stream: Writable; output: () => string } {
  let buf = "";
  const stream = new Writable({
    write(chunk, _encoding, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { stream, output: () => buf };
}

// Under vitest, stress-test.ts's `__dirname`-relative manifest path resolves against the TS
// source tree (src/cli/commands), not the bundled dist/ layout its `../data/...` join assumes
// in production — the same pre-existing constraint TC-121's comment documents ("the command's
// manifest-path resolution ... does not resolve correctly against the TS source path vitest
// would otherwise use"). So `runStressTest`-level tests here mock `node:fs`'s `readFileSync`
// to serve a synthetic single-scenario manifest, rather than depending on that path resolving.
const FAKE_MANIFEST = JSON.stringify({
  scenarios: [
    {
      id: "001",
      category: "01-eur-gains",
      slug: "eur-gain-10shares",
      description: "Single EUR stock",
      transactions: [
        {
          date: "2024-01-02",
          product: "Acme",
          isin: "IT0000000001",
          qty: 10,
          price: 100,
          currency: "EUR",
          fee: 2,
        },
        {
          date: "2024-03-01",
          product: "Acme",
          isin: "IT0000000001",
          qty: -10,
          price: 150,
          currency: "EUR",
          fee: 2,
        },
      ],
      expect: {
        calc_exit: 0,
        fifo_exit: 0,
        json_exit: 0,
        en_exit: 0,
        validate_exit: 0,
        warning_count: 0,
      },
    },
  ],
});

function mockManifestFs(): void {
  vi.doMock("node:fs", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    return {
      ...actual,
      readFileSync: (p: unknown, enc: unknown) =>
        typeof p === "string" && p.includes("stress-manifest.json")
          ? FAKE_MANIFEST
          : (actual.readFileSync as (...a: unknown[]) => unknown)(p, enc),
    };
  });
}

// ---------------------------------------------------------------------------
// reporter.ts — formatTable()
// ---------------------------------------------------------------------------

describe("TC-225: recap header stays unstyled regardless of pass/fail mix", () => {
  it("mixed pass/fail: the Scenari/Passati/Falliti line carries no ANSI escapes", () => {
    const report: StressReport = buildReport(
      [makeResult("001", true), makeResult("002", false)],
      1,
      2,
    );
    const table = formatTable(report, true);
    const recapLine = table.split("\n")[1];
    expect(recapLine).toContain("Scenari: 2");
    expect(recapLine).toBe(stripAnsi(recapLine));
  });

  it("all-pass: the recap line is still unstyled (not colored green)", () => {
    const report: StressReport = buildReport(
      [makeResult("001", true), makeResult("002", true)],
      1,
      2,
    );
    const table = formatTable(report, true);
    const recapLine = table.split("\n")[1];
    expect(recapLine).toBe(stripAnsi(recapLine));
  });
});

describe("TC-227: ESITO column colored by verdict; other columns/header navy", () => {
  it("header row: all four cells (including ESITO's label) are wrapped navy as one segment", () => {
    const report: StressReport = buildReport([makeResult("001", true)], 1, 1);
    const table = formatTable(report, true);
    const lines = table.split("\n");
    const headerLine = lines[3]; // STRESS TEST / recap / blank / header
    expect(headerLine.startsWith(NAVY)).toBe(true);
    expect(stripAnsi(headerLine)).toContain("ID");
    expect(stripAnsi(headerLine)).toContain("ESITO");
  });

  it("PASS row: ESITO cell is green, ID/CATEGORIA/DESCRIZIONE cells are unstyled", () => {
    const report: StressReport = buildReport([makeResult("001", true)], 1, 1);
    const table = formatTable(report, true);
    const lines = table.split("\n");
    const dataLine = lines[4];
    expect(dataLine).toContain(GREEN);
    expect(dataLine).not.toContain(RED);
    // ID cell ("001 ") comes before any ANSI escape in the row.
    expect(dataLine.startsWith("001")).toBe(true);
    expect(stripAnsi(dataLine)).toContain("✓ PASS");
  });

  it("FAIL row: ESITO cell is red", () => {
    const report: StressReport = buildReport([makeResult("001", false)], 1, 1);
    const table = formatTable(report, true);
    const lines = table.split("\n");
    const dataLine = lines[4];
    expect(dataLine).toContain(RED);
    expect(dataLine).not.toContain(GREEN);
    expect(stripAnsi(dataLine)).toContain("✗ FAIL");
  });

  it("column widths (plain text) are unchanged whether color is on or off", () => {
    const report: StressReport = buildReport(
      [makeResult("001", true), makeResult("002", false)],
      1,
      2,
    );
    const colored = formatTable(report, true);
    const uncolored = formatTable(report, false);
    expect(stripAnsi(colored)).toBe(uncolored);
  });

  it("failure-detail lines (→ cmd:) stay plain even when color is on", () => {
    const report: StressReport = buildReport([makeResult("001", false)], 1, 1);
    const table = formatTable(report, true);
    const detailLine = table
      .split("\n")
      .find((l) => l.includes("→ calc:"))!;
    expect(detailLine).toBeDefined();
    expect(detailLine).toBe(stripAnsi(detailLine));
  });
});

describe("TC-228: PASSATI:/FALLITI: footer follows zero-is-neutral rule", () => {
  it("FALLITI: 0 is unstyled; PASSATI: is always green", () => {
    const report: StressReport = buildReport([makeResult("001", true)], 1, 1);
    const table = formatTable(report, true);
    const lines = table.split("\n");
    const passatiLine = lines.find((l) => stripAnsi(l).startsWith("PASSATI:"))!;
    const fallitiLine = lines.find((l) => stripAnsi(l).startsWith("FALLITI:"))!;
    expect(passatiLine).toContain(GREEN);
    expect(fallitiLine).toBe(stripAnsi(fallitiLine));
  });

  it("FALLITI: N>0 is red", () => {
    const report: StressReport = buildReport(
      [makeResult("001", true), makeResult("002", false)],
      1,
      2,
    );
    const table = formatTable(report, true);
    const lines = table.split("\n");
    const fallitiLine = lines.find((l) => stripAnsi(l).startsWith("FALLITI:"))!;
    expect(fallitiLine).toContain(RED);
  });

  it("color: false produces no ANSI escapes at all", () => {
    const report: StressReport = buildReport(
      [makeResult("001", true), makeResult("002", false)],
      1,
      2,
    );
    const table = formatTable(report, false);
    expect(table).toBe(stripAnsi(table));
  });
});

// ---------------------------------------------------------------------------
// stress-test.ts — runStressTest()'s own lines (mocked spawnSync + runScenario
// so this exercises real command logic without spawning the built CLI —
// mirrors rates-color.test.ts's node:https mocking approach).
// ---------------------------------------------------------------------------

describe("TC-226 / TC-229: stress-test's own progress and setup-warning lines", () => {
  it("passing scenario: progress line is whole-line green, never teal", async () => {
    vi.resetModules();
    mockManifestFs();
    vi.doMock("node:child_process", () => ({
      spawnSync: () => ({ status: 0, stdout: "", stderr: "" }),
    }));
    vi.doMock("../src/stress/runner.js", () => ({
      runScenario: () => makeResult("001", true),
    }));

    const { runStressTest } = await import("../src/cli/commands/stress-test.js");
    const stdout = makeWritable();
    const stderr = makeWritable();
    await runStressTest([], { range: "1-1" }, stdout.stream, stderr.stream, true);

    const progressLine = stdout
      .output()
      .split("\n")
      .find((l) => stripAnsi(l).includes("eur-gain-10shares"))!;
    expect(progressLine).toBeDefined();
    expect(progressLine.startsWith(GREEN)).toBe(true);
    expect(progressLine).not.toContain(TEAL);
    expect(progressLine).not.toContain(RED);

    vi.doUnmock("node:child_process");
    vi.doUnmock("../src/stress/runner.js");
    vi.doUnmock("node:fs");
    vi.resetModules();
  });

  it("failing scenario: progress line is whole-line red, never teal", async () => {
    vi.resetModules();
    mockManifestFs();
    vi.doMock("node:child_process", () => ({
      spawnSync: () => ({ status: 0, stdout: "", stderr: "" }),
    }));
    vi.doMock("../src/stress/runner.js", () => ({
      runScenario: () => makeResult("001", false),
    }));

    const { runStressTest } = await import("../src/cli/commands/stress-test.js");
    const stdout = makeWritable();
    const stderr = makeWritable();
    await runStressTest([], { range: "1-1" }, stdout.stream, stderr.stream, true);

    const progressLine = stdout
      .output()
      .split("\n")
      .find((l) => stripAnsi(l).includes("eur-gain-10shares"))!;
    expect(progressLine).toBeDefined();
    expect(progressLine.startsWith(RED)).toBe(true);
    expect(progressLine).not.toContain(TEAL);
    expect(progressLine).not.toContain(GREEN);

    vi.doUnmock("node:child_process");
    vi.doUnmock("../src/stress/runner.js");
    vi.doUnmock("node:fs");
    vi.resetModules();
  });

  it("setup Warning: lines are amber when rates --check / config --show fail", async () => {
    vi.resetModules();
    mockManifestFs();
    vi.doMock("node:child_process", () => ({
      spawnSync: () => ({ status: 1, stdout: "", stderr: "" }),
    }));
    vi.doMock("../src/stress/runner.js", () => ({
      runScenario: () => makeResult("001", true),
    }));

    const { runStressTest } = await import("../src/cli/commands/stress-test.js");
    const stdout = makeWritable();
    const stderr = makeWritable();
    await runStressTest([], { range: "1-1" }, stdout.stream, stderr.stream, true);

    const errLines = stderr.output().split("\n").filter(Boolean);
    expect(errLines.length).toBe(2);
    for (const line of errLines) {
      expect(line.startsWith(AMBER)).toBe(true);
      expect(stripAnsi(line)).toContain("Warning:");
    }

    vi.doUnmock("node:child_process");
    vi.doUnmock("../src/stress/runner.js");
    vi.doUnmock("node:fs");
    vi.resetModules();
  });

  it("Note: --output-dir line stays unstyled even with color on", async () => {
    vi.resetModules();
    mockManifestFs();
    vi.doMock("node:child_process", () => ({
      spawnSync: () => ({ status: 0, stdout: "", stderr: "" }),
    }));
    vi.doMock("../src/stress/runner.js", () => ({
      runScenario: () => makeResult("001", true),
    }));

    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const userDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "stress-color-note-"),
    );

    const { runStressTest } = await import("../src/cli/commands/stress-test.js");
    const stdout = makeWritable();
    const stderr = makeWritable();
    await runStressTest(
      [],
      { range: "1-1", "output-dir": userDir },
      stdout.stream,
      stderr.stream,
      true,
    );

    const noteLine = stdout
      .output()
      .split("\n")
      .find((l) => l.includes("Note:"))!;
    expect(noteLine).toBeDefined();
    expect(noteLine).toBe(stripAnsi(noteLine));

    fs.rmSync(userDir, { recursive: true, force: true });
    vi.doUnmock("node:child_process");
    vi.doUnmock("../src/stress/runner.js");
    vi.doUnmock("node:fs");
    vi.resetModules();
  });

  it("color: false produces no ANSI escapes anywhere in stdout/stderr", async () => {
    vi.resetModules();
    mockManifestFs();
    vi.doMock("node:child_process", () => ({
      spawnSync: () => ({ status: 1, stdout: "", stderr: "" }),
    }));
    vi.doMock("../src/stress/runner.js", () => ({
      runScenario: () => makeResult("001", false),
    }));

    const { runStressTest } = await import("../src/cli/commands/stress-test.js");
    const stdout = makeWritable();
    const stderr = makeWritable();
    await runStressTest([], { range: "1-1" }, stdout.stream, stderr.stream, false);

    expect(stdout.output()).toBe(stripAnsi(stdout.output()));
    expect(stderr.output()).toBe(stripAnsi(stderr.output()));

    vi.doUnmock("node:child_process");
    vi.doUnmock("../src/stress/runner.js");
    vi.doUnmock("node:fs");
    vi.resetModules();
  });
});
