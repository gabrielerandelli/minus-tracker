import { describe, it, expect, beforeEach } from "vitest";
import { runValidate } from "../src/cli/commands/validate.js";
import { it as itStrings } from "../src/i18n/it.js";
import { Writable } from "node:stream";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/valid-trades.csv");

describe("TC-030: validate clean file exits 0", () => {
  let stdoutOutput: string;
  let stderrOutput: string;
  let mockStdout: Writable;
  let mockStderr: Writable;

  beforeEach(() => {
    stdoutOutput = "";
    stderrOutput = "";
    mockStdout = new Writable({
      write(chunk, _encoding, cb) {
        stdoutOutput += chunk.toString();
        cb();
      },
    });
    mockStderr = new Writable({
      write(chunk, _encoding, cb) {
        stderrOutput += chunk.toString();
        cb();
      },
    });
  });

  it("returns exit code 0 for a valid CSV with 2 transactions", async () => {
    const exitCode = await runValidate(
      [fixturePath],
      {},
      itStrings,
      mockStdout,
      mockStderr,
    );
    expect(exitCode).toBe(0);
  });

  it("writes nothing to stderr for a clean file", async () => {
    await runValidate([fixturePath], {}, itStrings, mockStdout, mockStderr);
    expect(stderrOutput).toBe("");
  });

  it("writes validateOk message with count=2, errors=0 to stdout", async () => {
    await runValidate([fixturePath], {}, itStrings, mockStdout, mockStderr);
    expect(stdoutOutput).toContain(
      "OK: 2 transazioni analizzate, 0 errori gravi",
    );
  });
});
