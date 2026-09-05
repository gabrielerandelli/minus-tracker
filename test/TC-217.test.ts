import { describe, it, expect, beforeEach } from "vitest";
import { runValidate } from "../src/cli/commands/validate.js";
import { it as itStrings } from "../src/i18n/it.js";
import { colorize, stripAnsi } from "../src/cli/colors.js";
import { Writable } from "node:stream";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cleanFixture = path.join(__dirname, "fixtures/valid-trades.csv");
const warningFixture = path.join(__dirname, "fixtures/missing-isin-row.csv");

const GREEN = "#4ADE80";
const AMBER = "#FBBF24";

function makeCapture() {
  let out = "";
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  const stderr = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  return {
    stdout,
    stderr,
    get output() {
      return out;
    },
  };
}

async function runPlainAndColored(fixture: string) {
  const plain = makeCapture();
  await runValidate([fixture], {}, itStrings, plain.stdout, plain.stderr, false);
  const colored = makeCapture();
  await runValidate([fixture], {}, itStrings, colored.stdout, colored.stderr, true);
  return { plainOutput: plain.output, coloredOutput: colored.output };
}

describe("TC-217: validate OK/warning lines colored whole-line (N=1)", () => {
  it("colors the OK: line green (whole line) for a clean file when color is enabled", async () => {
    const { plainOutput, coloredOutput } = await runPlainAndColored(cleanFixture);
    const okLine = plainOutput.trim().split("\n")[0]!;
    expect(okLine).toContain("OK:");
    expect(coloredOutput).toContain(colorize(okLine, GREEN, true));
  });

  it("does not color the OK: line when color is disabled (text-preservation invariant)", async () => {
    const cap = makeCapture();
    await runValidate([cleanFixture], {}, itStrings, cap.stdout, cap.stderr, false);
    expect(cap.output).toBe(stripAnsi(cap.output));
    expect(cap.output).toContain("OK:");
  });

  it("colors both the OK: line and each per-row warning line amber (whole-line) when the file has warnings", async () => {
    const { plainOutput, coloredOutput } = await runPlainAndColored(warningFixture);
    const lines = plainOutput.split("\n").filter((l) => l.length > 0);
    // First line is the OK: block header, the rest are per-row warning lines.
    const okLine = lines[0]!;
    expect(okLine).toContain("OK:");
    expect(lines.length).toBeGreaterThan(1);

    for (const line of lines) {
      expect(coloredOutput).toContain(colorize(line, AMBER, true));
      // Never green when the block has at least one warning.
      expect(coloredOutput).not.toContain(colorize(line, GREEN, true));
    }
  });

  it("text-preservation invariant: stripAnsi(colored) === plain for a file with warnings", async () => {
    const { plainOutput, coloredOutput } = await runPlainAndColored(warningFixture);
    expect(stripAnsi(coloredOutput)).toBe(plainOutput);
  });
});
