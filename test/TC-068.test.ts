import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runCalc } from "../src/cli/commands/calc.js";
import { it as itStrings } from "../src/i18n/it.js";

/**
 * TC-068: --carry-forward flag format validation
 *
 * Valid format: YYYY:amount  (e.g. "2023:2500" or "2023:2500.50")
 * Invalid formats must cause exit 2 and a locale-aware error on stderr.
 *
 * Cases tested:
 *   "2023"      → missing colon+amount → exit 2
 *   "abc:def"   → non-numeric year/amount → exit 2
 *   "2023:"     → missing amount after colon → exit 2
 *   "2023:2500" → valid → exit 0
 *
 * The valid case (TC-068d) reaches calc's auto-classify step, which writes a
 * .classify.json sidecar — use a temp copy of the fixture so that write
 * doesn't land in the committed test/fixtures/ directory.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceFixture = path.join(__dirname, "fixtures/valid-trades.csv");

let tmpDir: string;
let fixturePath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc068-"));
  fixturePath = path.join(tmpDir, "valid-trades.csv");
  fs.copyFileSync(sourceFixture, fixturePath);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeStreams() {
  let out = "";
  let err = "";
  const mockStdout = new Writable({
    write(chunk, _, cb) {
      out += chunk.toString();
      cb();
    },
  });
  const mockStderr = new Writable({
    write(chunk, _, cb) {
      err += chunk.toString();
      cb();
    },
  });
  return { mockStdout, mockStderr, getOut: () => out, getErr: () => err };
}

// ── Invalid: no amount ───────────────────────────────────────────────────────

let exitCode_noAmount: number;
let stderr_noAmount: string;

describe('TC-068a: --carry-forward "2023" (missing colon+amount) → exit 2', () => {
  beforeAll(async () => {
    const { mockStdout, mockStderr, getErr } = makeStreams();
    exitCode_noAmount = await runCalc(
      [fixturePath],
      { "carry-forward": "2023" },
      itStrings,
      mockStdout,
      mockStderr,
    );
    stderr_noAmount = getErr();
  });

  it("exits with code 2", () => {
    expect(exitCode_noAmount).toBe(2);
  });

  it("stderr contains locale-aware invalid format message", () => {
    expect(stderr_noAmount).toContain("carry-forward");
  });
});

// ── Invalid: non-numeric values ──────────────────────────────────────────────

let exitCode_nonNumeric: number;
let stderr_nonNumeric: string;

describe('TC-068b: --carry-forward "abc:def" (non-numeric) → exit 2', () => {
  beforeAll(async () => {
    const { mockStdout, mockStderr, getErr } = makeStreams();
    exitCode_nonNumeric = await runCalc(
      [fixturePath],
      { "carry-forward": "abc:def" },
      itStrings,
      mockStdout,
      mockStderr,
    );
    stderr_nonNumeric = getErr();
  });

  it("exits with code 2", () => {
    expect(exitCode_nonNumeric).toBe(2);
  });

  it("stderr contains locale-aware invalid format message", () => {
    expect(stderr_nonNumeric).toContain("carry-forward");
  });
});

// ── Invalid: missing amount after colon ──────────────────────────────────────

let exitCode_noVal: number;
let stderr_noVal: string;

describe('TC-068c: --carry-forward "2023:" (empty amount) → exit 2', () => {
  beforeAll(async () => {
    const { mockStdout, mockStderr, getErr } = makeStreams();
    exitCode_noVal = await runCalc(
      [fixturePath],
      { "carry-forward": "2023:" },
      itStrings,
      mockStdout,
      mockStderr,
    );
    stderr_noVal = getErr();
  });

  it("exits with code 2", () => {
    expect(exitCode_noVal).toBe(2);
  });

  it("stderr contains locale-aware invalid format message", () => {
    expect(stderr_noVal).toContain("carry-forward");
  });
});

// ── Valid ────────────────────────────────────────────────────────────────────

let exitCode_valid: number;

describe('TC-068d: --carry-forward "2023:2500" (valid) → exit 0', () => {
  beforeAll(async () => {
    const { mockStdout, mockStderr } = makeStreams();
    exitCode_valid = await runCalc(
      [fixturePath],
      { "carry-forward": "2023:2500" },
      itStrings,
      mockStdout,
      mockStderr,
    );
  });

  it("exits with code 0", () => {
    expect(exitCode_valid).toBe(0);
  });
});
