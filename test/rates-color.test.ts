import { describe, it, expect, vi } from "vitest";
import { Writable } from "node:stream";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { it as itStrings } from "../src/i18n/it.js";
import { stripAnsi } from "../src/cli/colors.js";

/**
 * Task 61: `rates` command coloring.
 *
 * TC-223: every `rates --check`/`--update` line matches its assigned palette role —
 * `ratesCoverage`/`ratesSnapshotWritten` navy, `ratesGapsNone`/`ratesUpdateDone` green,
 * `ratesGaps` amber, `ratesUpdateFetching` teal (the one stress-test-external use of teal).
 *
 * `--update` cases mock `node:https` (rather than `fetchEcbData` itself, since it's a
 * same-module internal call that a self-mock of `rates.js` would not intercept) to make
 * network success/failure deterministic — this sandbox's egress proxy already rejects the
 * real ECB host, which would otherwise make these tests flaky across environments.
 */

const NAVY = "\x1b[38;2;27;73;101m"; // #1B4965
const GREEN = "\x1b[38;2;74;222;128m"; // #4ADE80
const AMBER = "\x1b[38;2;251;191;36m"; // #FBBF24
const TEAL = "\x1b[38;2;45;212;191m"; // #2DD4BF

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

function mockHttpsSuccess(): void {
  vi.doMock("node:https", () => ({
    get: (_url: string, cb: (res: EventEmitter) => void) => {
      const res = new EventEmitter();
      const req = new EventEmitter();
      process.nextTick(() => {
        cb(res);
        // One well-formed ECB SDMX csvdata row (date col 6, rate col 7).
        res.emit(
          "data",
          Buffer.from(
            "KEY,FREQ,CURRENCY,DENOM,TYPE,SUFFIX,2024-01-02,1.1050,extra\n",
          ),
        );
        res.emit("end");
      });
      return req;
    },
  }));
}

function mockHttpsFailure(): void {
  vi.doMock("node:https", () => ({
    get: (_url: string) => {
      const req = new EventEmitter();
      process.nextTick(() => req.emit("error", new Error("network down")));
      return req;
    },
  }));
}

describe("TC-223: rates --check line coloring (real bundled snapshot, has gaps)", () => {
  it("Copertura: line is navy; Lacune: <list> line is amber", async () => {
    const { runRates } = await import("../src/cli/commands/rates.js");
    const stdout = makeWritable();
    const stderr = makeWritable();
    const exitCode = await runRates(
      [],
      { check: true },
      itStrings,
      stdout.stream,
      stderr.stream,
      true,
    );
    expect(exitCode).toBe(0);
    const lines = stdout.output().split("\n").filter(Boolean);
    expect(lines.length).toBe(2);

    expect(lines[0].startsWith(NAVY)).toBe(true);
    expect(stripAnsi(lines[0])).toContain("Copertura:");
    expect(lines[0]).not.toContain(GREEN);
    expect(lines[0]).not.toContain(AMBER);

    // The bundled fixture snapshot has real gaps (asserted directly, not just
    // assumed), so this exercises the amber branch end to end.
    expect(stripAnsi(lines[1])).toMatch(/^Lacune: (?!nessuna)/);
    expect(lines[1].startsWith(AMBER)).toBe(true);
    expect(lines[1]).not.toContain(GREEN);
  });

  it("color: false produces no ANSI escapes at all", async () => {
    const { runRates } = await import("../src/cli/commands/rates.js");
    const stdout = makeWritable();
    const stderr = makeWritable();
    await runRates([], { check: true }, itStrings, stdout.stream, stderr.stream, false);
    expect(stdout.output()).toBe(stripAnsi(stdout.output()));
  });

  it("stripping color yields byte-identical text to the uncolored run", async () => {
    const { runRates } = await import("../src/cli/commands/rates.js");
    const colored = makeWritable();
    const uncolored = makeWritable();
    await runRates(
      [],
      { check: true },
      itStrings,
      colored.stream,
      makeWritable().stream,
      true,
    );
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
});

describe("TC-223: rates --check Lacune: nessuna is green (synthetic gap-free snapshot)", () => {
  it("colors the no-gaps line green, not amber", async () => {
    vi.resetModules();
    vi.doMock("../src/rates/index.js", async () => {
      const actual = await vi.importActual<typeof import("../src/rates/index.js")>(
        "../src/rates/index.js",
      );
      return {
        ...actual,
        // A single business day of data has zero missing business days in its
        // own [start, end] span, so getCoverage's `gaps` comes back empty.
        getActiveSnapshot: () => ({ USD: { "2024-01-02": 1.1 } }),
      };
    });

    const { runRates } = await import("../src/cli/commands/rates.js");
    const stdout = makeWritable();
    const stderr = makeWritable();
    const exitCode = await runRates(
      [],
      { check: true },
      itStrings,
      stdout.stream,
      stderr.stream,
      true,
    );
    expect(exitCode).toBe(0);
    const lines = stdout.output().split("\n").filter(Boolean);
    expect(stripAnsi(lines[1])).toBe("Lacune: nessuna");
    expect(lines[1].startsWith(GREEN)).toBe(true);
    expect(lines[1]).not.toContain(AMBER);

    vi.doUnmock("../src/rates/index.js");
    vi.resetModules();
  });
});

describe("TC-223: rates --update line coloring", () => {
  it("colors fetching teal, done green, and snapshot-written navy on success", async () => {
    vi.resetModules();
    mockHttpsSuccess();

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rates-color-update-"));
    const snapshotPath = path.join(dir, "ecb-rates.json");
    const stdout = makeWritable();
    const stderr = makeWritable();

    const { updateRates } = await import("../src/cli/commands/rates.js");
    await updateRates(snapshotPath, stdout.stream, stderr.stream, itStrings, true);

    const lines = stdout.output().split("\n").filter(Boolean);
    expect(lines[0].startsWith(TEAL)).toBe(true);
    expect(stripAnsi(lines[0])).toContain("Recupero dati BCE");

    expect(lines[1].startsWith(GREEN)).toBe(true);
    expect(stripAnsi(lines[1])).toContain("Completato");

    expect(lines[2].startsWith(NAVY)).toBe(true);
    expect(stripAnsi(lines[2])).toContain("Snapshot scritto in");

    expect(stderr.output()).toBe("");

    fs.rmSync(dir, { recursive: true, force: true });
    vi.doUnmock("node:https");
    vi.resetModules();
  });

  it("per-currency fetch failure on stderr is amber and non-fatal", async () => {
    vi.resetModules();
    mockHttpsFailure();

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rates-color-update-err-"));
    const snapshotPath = path.join(dir, "ecb-rates.json");
    const stdout = makeWritable();
    const stderr = makeWritable();

    const { updateRates } = await import("../src/cli/commands/rates.js");
    await updateRates(snapshotPath, stdout.stream, stderr.stream, itStrings, true);

    const errLines = stderr.output().split("\n").filter(Boolean);
    expect(errLines.length).toBe(3); // USD, GBP, CHF each fail once
    for (const line of errLines) {
      expect(line.startsWith(AMBER)).toBe(true);
      expect(stripAnsi(line)).toContain("Failed to fetch");
    }
    // Non-fatal: the run still completes and writes fetching + done + snapshot-written.
    const outLines = stdout.output().split("\n").filter(Boolean);
    expect(outLines.length).toBe(3);
    expect(outLines[1].startsWith(GREEN)).toBe(true);
    expect(outLines[2].startsWith(NAVY)).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
    vi.doUnmock("node:https");
    vi.resetModules();
  });

  it("color: false produces no ANSI escapes at all", async () => {
    vi.resetModules();
    mockHttpsSuccess();

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rates-color-update-nocolor-"));
    const snapshotPath = path.join(dir, "ecb-rates.json");
    const stdout = makeWritable();
    const stderr = makeWritable();

    const { updateRates } = await import("../src/cli/commands/rates.js");
    await updateRates(snapshotPath, stdout.stream, stderr.stream, itStrings, false);

    expect(stdout.output()).toBe(stripAnsi(stdout.output()));

    fs.rmSync(dir, { recursive: true, force: true });
    vi.doUnmock("node:https");
    vi.resetModules();
  });
});
