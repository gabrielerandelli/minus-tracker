import { describe, it, expect } from "vitest";
import { runValidate } from "../src/cli/commands/validate.js";
import { it as itStrings } from "../src/i18n/it.js";
import { colorize, stripAnsi } from "../src/cli/colors.js";
import { Writable } from "node:stream";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cleanFixtureA = path.join(__dirname, "fixtures/valid-trades.csv");
const cleanFixtureB = path.join(__dirname, "fixtures/etf-trades.csv");
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

async function runPlainAndColored(files: string[]) {
  const plain = makeCapture();
  await runValidate(files, {}, itStrings, plain.stdout, plain.stderr, false);
  const colored = makeCapture();
  await runValidate(files, {}, itStrings, colored.stdout, colored.stderr, true);
  return { plainOutput: plain.output, coloredOutput: colored.output };
}

function findTotaleLine(plainOutput: string): string {
  const line = plainOutput.split("\n").find((l) => l.startsWith("Totale:"));
  if (!line) throw new Error("Totale: line not found in plain output");
  return line;
}

describe("TC-218: validate multi-file Totale: colored by its own warning count", () => {
  it("colors Totale: green when the aggregate warning count is zero", async () => {
    const { plainOutput, coloredOutput } = await runPlainAndColored([
      cleanFixtureA,
      cleanFixtureB,
    ]);
    const totaleLine = findTotaleLine(plainOutput);
    expect(totaleLine).toContain("0 avvisi");
    expect(coloredOutput).toContain(colorize(totaleLine, GREEN, true));
    expect(coloredOutput).not.toContain(colorize(totaleLine, AMBER, true));
  });

  it("colors Totale: amber when the aggregate warning count is nonzero, driven by its own count not a per-file block's", async () => {
    const { plainOutput, coloredOutput } = await runPlainAndColored([
      cleanFixtureA,
      warningFixture,
    ]);
    const totaleLine = findTotaleLine(plainOutput);
    expect(totaleLine).not.toContain("0 avvisi");
    expect(coloredOutput).toContain(colorize(totaleLine, AMBER, true));
    expect(coloredOutput).not.toContain(colorize(totaleLine, GREEN, true));

    // The first file's own OK: block is still green even though the aggregate Totale: is
    // amber — proves Totale:'s color is driven by its own {warnings} count, not re-derived
    // from the last per-file block rendered above.
    const lines = plainOutput.split("\n").filter((l) => l.length > 0);
    const firstFileOkLine = lines.find((l) => l.includes("OK:"))!;
    expect(coloredOutput).toContain(colorize(firstFileOkLine, GREEN, true));
  });

  it("text-preservation invariant: stripAnsi(colored) === plain across the whole multi-file run", async () => {
    const { plainOutput, coloredOutput } = await runPlainAndColored([
      cleanFixtureA,
      warningFixture,
    ]);
    expect(stripAnsi(coloredOutput)).toBe(plainOutput);
  });
});
