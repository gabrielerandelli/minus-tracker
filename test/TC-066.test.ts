import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { runClassify } from "../src/cli/commands/classify.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * TC-066: classify --offline → classifyOfflineWarning printed, sidecar written
 *
 * With --offline, the command must:
 *   - skip OpenFIGI (no network)
 *   - print classifyOfflineWarning to stdout
 *   - write a sidecar .classify.json with source:"user", confirmedByUser:false
 *     (unresolved/unconfirmed stub — matches the MCP classify_instruments
 *     offline path, see Classifier.classify's offline branch)
 *   - return exit code 0
 *
 * This also indirectly validates TC-061 (source:"user", confirmedByUser:false
 * entries written by the classify CLI command).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/valid-trades.csv");

// We'll write the CSV to a temp dir so the sidecar lands there too
let tempDir: string;
let tempCsvPath: string;
let tempSidecarPath: string;

afterEach(() => {
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

function setupTempCsv(): void {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc-066-"));
  tempCsvPath = path.join(tempDir, "trades.csv");
  tempSidecarPath = path.join(tempDir, "trades.classify.json");
  // Copy the fixture CSV to the temp directory
  fs.copyFileSync(fixturePath, tempCsvPath);
}

describe("TC-066: classify --offline → warning printed, sidecar written", () => {
  it("returns exit code 0 in offline mode", async () => {
    setupTempCsv();

    const mockStdout = new Writable({
      write(_, __, cb) {
        cb();
      },
    });
    const mockStderr = new Writable({
      write(_, __, cb) {
        cb();
      },
    });

    const exitCode = await runClassify(
      [tempCsvPath],
      { offline: true },
      itStrings,
      mockStdout,
      mockStderr,
    );

    expect(exitCode).toBe(0);
  });

  it("prints classifyOfflineWarning to stdout", async () => {
    setupTempCsv();

    let stdoutOutput = "";
    const mockStdout = new Writable({
      write(chunk, _, cb) {
        stdoutOutput += chunk.toString();
        cb();
      },
    });
    const mockStderr = new Writable({
      write(_, __, cb) {
        cb();
      },
    });

    await runClassify(
      [tempCsvPath],
      { offline: true },
      itStrings,
      mockStdout,
      mockStderr,
    );

    expect(stdoutOutput).toContain(itStrings.classifyOfflineWarning);
  });

  it("writes a sidecar .classify.json file", async () => {
    setupTempCsv();

    const mockStdout = new Writable({
      write(_, __, cb) {
        cb();
      },
    });
    const mockStderr = new Writable({
      write(_, __, cb) {
        cb();
      },
    });

    await runClassify(
      [tempCsvPath],
      { offline: true },
      itStrings,
      mockStdout,
      mockStderr,
    );

    expect(fs.existsSync(tempSidecarPath)).toBe(true);
  });

  it("sidecar entries have source:'user' and confirmedByUser:false", async () => {
    setupTempCsv();

    const mockStdout = new Writable({
      write(_, __, cb) {
        cb();
      },
    });
    const mockStderr = new Writable({
      write(_, __, cb) {
        cb();
      },
    });

    await runClassify(
      [tempCsvPath],
      { offline: true },
      itStrings,
      mockStdout,
      mockStderr,
    );

    const raw = fs.readFileSync(tempSidecarPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      version: number;
      classifications: Record<
        string,
        { source: string; confirmedByUser: boolean; assetClass: string }
      >;
    };

    expect(parsed.version).toBe(1);

    const entries = Object.values(parsed.classifications);
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      expect(entry.source).toBe("user");
      expect(entry.confirmedByUser).toBe(false);
    }
  });

  it("sidecar contains the ISIN from the fixture (US0378331005 — Apple)", async () => {
    setupTempCsv();

    const mockStdout = new Writable({
      write(_, __, cb) {
        cb();
      },
    });
    const mockStderr = new Writable({
      write(_, __, cb) {
        cb();
      },
    });

    await runClassify(
      [tempCsvPath],
      { offline: true },
      itStrings,
      mockStdout,
      mockStderr,
    );

    const raw = fs.readFileSync(tempSidecarPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      classifications: Record<string, unknown>;
    };

    expect("US0378331005" in parsed.classifications).toBe(true);
  });

  it("classifyWritten path is included in stdout", async () => {
    setupTempCsv();

    let stdoutOutput = "";
    const mockStdout = new Writable({
      write(chunk, _, cb) {
        stdoutOutput += chunk.toString();
        cb();
      },
    });
    const mockStderr = new Writable({
      write(_, __, cb) {
        cb();
      },
    });

    await runClassify(
      [tempCsvPath],
      { offline: true },
      itStrings,
      mockStdout,
      mockStderr,
    );

    expect(stdoutOutput).toContain(itStrings.classifyWritten(tempSidecarPath));
  });

  it("does not write anything to stderr in offline mode with valid CSV", async () => {
    setupTempCsv();

    let stderrOutput = "";
    const mockStdout = new Writable({
      write(_, __, cb) {
        cb();
      },
    });
    const mockStderr = new Writable({
      write(chunk, _, cb) {
        stderrOutput += chunk.toString();
        cb();
      },
    });

    await runClassify(
      [tempCsvPath],
      { offline: true },
      itStrings,
      mockStdout,
      mockStderr,
    );

    expect(stderrOutput).toBe("");
  });
});
