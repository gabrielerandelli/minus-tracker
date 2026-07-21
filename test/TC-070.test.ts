import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * TC-070: mixed-asset CSV, no pre-existing sidecar — calc auto-classifies
 *
 * Previously (pre-auto-classify), a CSV with both IE-prefixed ISINs (ETFs)
 * and non-IE ISINs (Stocks) but no sidecar produced a single-bucket fallback
 * with a soft mixed-asset warning. Now calc always classifies first (offline,
 * since there's no TTY here), so this fixture instead produces full
 * two-bucket output — this is the intended behavior change.
 *
 * Fixture: mixed-trades.csv (IE00B4L5Y983 + US0378331005), copied to a temp
 * dir so calc's auto-classify sidecar write doesn't land in the committed
 * test/fixtures/ directory.
 *
 * Expected:
 *   - exit 0
 *   - stderr contains the auto-classify-offline notice
 *   - stdout contains "BUCKET B" (offline classification defaults unresolved
 *     ISINs to Bucket B — see src/classifier/index.ts offline stub path)
 *   - a .classify.json sidecar is written next to the CSV
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceFixture = path.join(__dirname, "fixtures/mixed-trades.csv");

let tmpDir: string;
let fixturePath: string;
let exitCode: number;
let stdoutOutput: string;
let stderrOutput: string;

describe("TC-070: mixed-asset CSV without a sidecar — calc auto-classifies", () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc070-"));
    fixturePath = path.join(tmpDir, "mixed-trades.csv");
    fs.copyFileSync(sourceFixture, fixturePath);

    stdoutOutput = "";
    stderrOutput = "";

    const mockStdout = new Writable({
      write(chunk, _, cb) {
        stdoutOutput += chunk.toString();
        cb();
      },
    });

    const mockStderr = new Writable({
      write(chunk, _, cb) {
        stderrOutput += chunk.toString();
        cb();
      },
    });

    exitCode = await runCalc(
      [fixturePath],
      {},
      itStrings,
      mockStdout,
      mockStderr,
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits with code 0", () => {
    expect(exitCode).toBe(0);
  });

  it("stderr contains the auto-classify-offline notice", () => {
    expect(stderrOutput).toBe(itStrings.autoClassifyOfflineNotice + "\n");
  });

  it('stdout contains "BUCKET B" section header (two-bucket output now active)', () => {
    expect(stdoutOutput).toContain("BUCKET B");
  });

  it("stdout contains standard summary PLUSVALENZE", () => {
    expect(stdoutOutput).toContain("PLUSVALENZE:");
  });

  it("writes a .classify.json sidecar next to the CSV", () => {
    expect(fs.existsSync(path.join(tmpDir, "mixed-trades.classify.json"))).toBe(
      true,
    );
  });
});
