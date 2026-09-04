import { describe, it, expect, afterEach } from "vitest";
import { Writable, Readable } from "node:stream";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { classifyToSidecar } from "../src/cli/commands/classify-core.js";
import { runClassify } from "../src/cli/commands/classify.js";
import { it as itStrings } from "../src/i18n/it.js";
import { stripAnsi } from "../src/cli/colors.js";
import type { Transaction, ClassificationMap } from "../src/types.js";

/**
 * Task 60: `classify` command coloring + `classifyUnknownType` gap documentation.
 *
 * TC-219: `classifyMergePrompt` unstyled — a prompt, not a signal.
 * TC-220: `classifyWritten` green; `classifyNonTtyError` red.
 * TC-221: `classifyOfflineWarning` amber, via both `classify --offline` and calc's
 *         auto-classify-offline path (the latter's own end-to-end wiring is Task 58's
 *         concern; here we only re-confirm classify-core.ts's own color choice, reused
 *         identically by both callers with no separate wiring).
 * TC-222: `classifyUnknownType` has no call site — implementation gap guard.
 */

const GREEN = "\x1b[38;2;74;222;128m"; // #4ADE80
const AMBER = "\x1b[38;2;251;191;36m"; // #FBBF24
const RED = "\x1b[38;2;248;113;113m"; // #F87171

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STOCK_ISIN = "US0378331005";

function makeTransaction(isin: string): Transaction {
  return {
    isin,
    product: `Product ${isin}`,
    date: "2024-01-10",
    type: "BUY",
    quantity: 10,
    pricePerUnit: 100,
    currency: "EUR",
    totalLocal: -1000,
    totalEUR: 1000,
    feesEUR: 0,
  };
}

interface CaptureResult {
  stdout: string;
  // Individual write() calls, kept separate — classifyMergePrompt deliberately
  // writes with no trailing "\n" (it shares a line with the user's typed answer),
  // so joining writes before splitting on "\n" would conflate it with whatever is
  // written right after it.
  writes: string[];
}

async function classifyToSidecarCapture(
  transactions: Transaction[],
  sidecarPath: string,
  opts: { offline: boolean },
  color: boolean,
  stdin?: NodeJS.ReadableStream,
): Promise<CaptureResult> {
  let stdoutBuf = "";
  const writes: string[] = [];
  const mockStdout = new Writable({
    write(chunk, _enc, cb) {
      const text = chunk.toString();
      stdoutBuf += text;
      writes.push(text);
      cb();
    },
  });
  await classifyToSidecar(
    transactions,
    sidecarPath,
    opts,
    itStrings,
    mockStdout,
    color,
    stdin,
  );
  return { stdout: stdoutBuf, writes };
}

let tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "classify-color-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

function writeConfirmedSidecar(sidecarPath: string, isin: string): void {
  const map: ClassificationMap = {
    [isin]: {
      product: `Product ${isin}`,
      assetClass: "Stock",
      bucketGain: "B",
      bucketLoss: "B",
      taxRate: 0,
      whiteListed: null,
      confirmedByUser: true,
      source: "user",
    },
  };
  fs.writeFileSync(
    sidecarPath,
    JSON.stringify({ version: 1, classifications: map }, null, 2),
    "utf-8",
  );
}

describe("TC-219: classifyMergePrompt unstyled", () => {
  it("stays unstyled even when color is enabled", async () => {
    const dir = makeTmpDir();
    const sidecarPath = path.join(dir, "sidecar.json");
    writeConfirmedSidecar(sidecarPath, STOCK_ISIN);

    const stdin = Readable.from(["y\n"]);
    const result = await classifyToSidecarCapture(
      [makeTransaction(STOCK_ISIN)],
      sidecarPath,
      { offline: false },
      true,
      stdin,
    );

    const promptWrite = result.writes[0];
    expect(promptWrite.length).toBeGreaterThan(0);
    expect(promptWrite).toBe(stripAnsi(promptWrite));
  });
});

describe("TC-220: classifyWritten green; classifyNonTtyError red", () => {
  it("classifyWritten is green after a fresh (offline) classify", async () => {
    const dir = makeTmpDir();
    const sidecarPath = path.join(dir, "sidecar.json");

    const result = await classifyToSidecarCapture(
      [makeTransaction(STOCK_ISIN)],
      sidecarPath,
      { offline: true },
      true,
    );

    const writtenLine = result.stdout
      .split("\n")
      .find((l) => stripAnsi(l).includes("sidecar.json"));
    expect(writtenLine).toBeDefined();
    expect(writtenLine!.startsWith(GREEN)).toBe(true);
  });

  it("classifyWritten is green after a merge-prompt classify (non-offline)", async () => {
    const dir = makeTmpDir();
    const sidecarPath = path.join(dir, "sidecar.json");
    writeConfirmedSidecar(sidecarPath, STOCK_ISIN);

    const stdin = Readable.from(["y\n"]);
    const result = await classifyToSidecarCapture(
      [makeTransaction(STOCK_ISIN)],
      sidecarPath,
      { offline: false },
      true,
      stdin,
    );

    const writtenWrite = result.writes.find((w) => stripAnsi(w).includes("sidecar.json"));
    expect(writtenWrite).toBeDefined();
    expect(writtenWrite!.startsWith(GREEN)).toBe(true);
  });

  it("classifyNonTtyError is red (color: true) via runClassify", async () => {
    let stderrBuf = "";
    const mockStdout = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });
    const mockStderr = new Writable({
      write(chunk, _enc, cb) {
        stderrBuf += chunk.toString();
        cb();
      },
    });

    // Non-interactive stdin (no TTY) and no --offline flag → hits the hard
    // TTY-precondition error before any file I/O.
    const exitCode = await runClassify(
      ["some-file.csv"],
      {},
      itStrings,
      mockStdout,
      mockStderr,
      true,
    );

    expect(exitCode).toBe(2);
    expect(stderrBuf.startsWith(RED)).toBe(true);
  });

  it("classifyNonTtyError has no ANSI when color: false", async () => {
    let stderrBuf = "";
    const mockStdout = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });
    const mockStderr = new Writable({
      write(chunk, _enc, cb) {
        stderrBuf += chunk.toString();
        cb();
      },
    });

    const exitCode = await runClassify(
      ["some-file.csv"],
      {},
      itStrings,
      mockStdout,
      mockStderr,
      false,
    );

    expect(exitCode).toBe(2);
    expect(stderrBuf).toBe(stripAnsi(stderrBuf));
  });
});

describe("TC-221: classifyOfflineWarning amber", () => {
  it("amber via classify --offline (classifyToSidecar's offline branch)", async () => {
    const dir = makeTmpDir();
    const sidecarPath = path.join(dir, "sidecar.json");

    const result = await classifyToSidecarCapture(
      [makeTransaction(STOCK_ISIN)],
      sidecarPath,
      { offline: true },
      true,
    );

    const firstLine = result.stdout.split("\n")[0];
    expect(firstLine.startsWith(AMBER)).toBe(true);
  });

  it(
    "amber via calc's auto-classify-offline path too — same classifyOfflineWarning call " +
      "site inside classifyToSidecar, reused with no separate wiring",
    async () => {
      const dir = makeTmpDir();
      const sidecarPath = path.join(dir, "sidecar.json");

      // calc's auto-classify path calls classifyToSidecar with offline:true whenever
      // stdin isn't a TTY (always true under vitest) and no sidecar exists yet — this
      // re-confirms it goes through the very same colored call site, not a duplicate.
      const result = await classifyToSidecarCapture(
        [makeTransaction(STOCK_ISIN)],
        sidecarPath,
        { offline: true },
        true,
      );

      const firstLine = result.stdout.split("\n")[0];
      expect(firstLine.startsWith(AMBER)).toBe(true);
    },
  );
});

describe("TC-222: classifyUnknownType has no call site (implementation gap guard)", () => {
  it("grep -rn \"\\.classifyUnknownType(\" src/ returns zero matches", () => {
    const srcDir = path.join(__dirname, "..", "src");
    const matches: string[] = [];

    function walk(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          const content = fs.readFileSync(full, "utf-8");
          if (content.includes(".classifyUnknownType(")) {
            matches.push(full);
          }
        }
      }
    }
    walk(srcDir);

    expect(matches).toEqual([]);
  });
});
