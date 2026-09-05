import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";
import { stripAnsi } from "../src/cli/colors.js";

/**
 * Task 58: `calc.ts` passes the `color` parameter it already receives (Task 57) into
 * `renderReport()`. This is an end-to-end regression guard on that wiring, complementing
 * the unit-level coverage of `renderReport()` itself in `renderer-colors.test.ts`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceFixture = path.join(__dirname, "fixtures/valid-trades.csv");

let tmpDir: string;
let fixturePath: string;

async function runWithColor(color: boolean) {
  let stdoutOutput = "";
  const mockStdout = new Writable({
    write(chunk, _enc, cb) {
      stdoutOutput += chunk.toString();
      cb();
    },
  });
  const mockStderr = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  await runCalc([fixturePath], {}, itStrings, mockStdout, mockStderr, color);
  return stdoutOutput;
}

describe("calc --color threading (Task 58)", () => {
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "calc-color-"));
    fixturePath = path.join(tmpDir, "valid-trades.csv");
    fs.copyFileSync(sourceFixture, fixturePath);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("color: true produces ANSI-colored output", async () => {
    const output = await runWithColor(true);
    expect(output).toContain("\x1b[38;2;");
  });

  it("color: false (default) produces no ANSI escapes", async () => {
    const output = await runWithColor(false);
    expect(output).toBe(stripAnsi(output));
  });

  it("stripping color from the colored run yields byte-identical text to the uncolored run", async () => {
    // Normalize the "Generato: <ISO timestamp>" line, which legitimately differs between
    // the two separate runCalc() invocations below — everything else must match exactly.
    const normalize = (s: string) => s.replace(/Generato: .+/, "Generato: <ts>");
    const colored = await runWithColor(true);
    const uncolored = await runWithColor(false);
    expect(normalize(stripAnsi(colored))).toBe(normalize(uncolored));
  });
});
