import { describe, it, expect, beforeEach } from "vitest";
import { runValidate } from "../src/cli/commands/validate.js";
import { it as itStrings } from "../src/i18n/it.js";
import { Writable } from "node:stream";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/missing-isin-col.csv");

describe("TC-031: validate with hard error exits 1", () => {
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

  it("returns exit code 1 for a CSV missing the ISIN column", async () => {
    const exitCode = await runValidate(
      [fixturePath],
      {},
      itStrings,
      mockStdout,
      mockStderr,
    );
    expect(exitCode).toBe(1);
  });

  it("writes the missing column error to stderr", async () => {
    await runValidate([fixturePath], {}, itStrings, mockStdout, mockStderr);
    expect(stderrOutput).toContain(itStrings.errorMissingColumn("ISIN"));
  });

  it("writes nothing to stdout on a hard parse error", async () => {
    await runValidate([fixturePath], {}, itStrings, mockStdout, mockStderr);
    expect(stdoutOutput).toBe("");
  });
});
