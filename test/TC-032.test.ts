import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { runRates } from "../src/cli/commands/rates.js";
import { it as itStrings } from "../src/i18n/it.js";

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

describe("TC-032 — rates --check shows coverage report", () => {
  it("exits 0 and prints coverage + gap report", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();

    const exitCode = await runRates(
      [],
      { check: true },
      itStrings,
      stdout.stream,
      stderr.stream,
    );

    const out = stdout.output();

    expect(exitCode).toBe(0);
    expect(out).toContain("Copertura:");
    expect(out).toContain("Valute:");
    expect(out).toContain("USD");
    expect(out).toContain("GBP");
    expect(out).toContain("CHF");
    expect(out).toContain("Lacune:");
  });
});
