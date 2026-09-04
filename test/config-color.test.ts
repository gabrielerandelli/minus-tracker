import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runConfig } from "../src/cli/commands/config.js";
import { it as itStrings } from "../src/i18n/it.js";
import { stripAnsi } from "../src/cli/colors.js";

/**
 * Task 61: `config` command coloring.
 *
 * TC-224: `configLangSet`/`configReset` green (state-changing confirmations);
 * `configCurrentLang` navy (a read-only query).
 */

const GREEN = "\x1b[38;2;74;222;128m"; // #4ADE80
const NAVY = "\x1b[38;2;27;73;101m"; // #1B4965

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

let tmpDir: string;
let originalXdg: string | undefined;
let originalLangEnv: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-color-"));
  originalXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpDir;
  originalLangEnv = process.env.MINUS_TRACKER_LANG;
  delete process.env.MINUS_TRACKER_LANG;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  if (originalLangEnv === undefined) delete process.env.MINUS_TRACKER_LANG;
  else process.env.MINUS_TRACKER_LANG = originalLangEnv;
});

describe("TC-224: config --lang / --reset are green; --show is navy", () => {
  it("--lang en colors the confirmation line green", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();
    const exitCode = await runConfig(
      [],
      { lang: "en" },
      itStrings,
      stdout.stream,
      stderr.stream,
      true,
    );
    expect(exitCode).toBe(0);
    const line = stdout.output().trimEnd();
    expect(line.startsWith(GREEN)).toBe(true);
    expect(stripAnsi(line)).toContain("Lingua impostata su:");
  });

  it("--reset colors the confirmation line green", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();
    const exitCode = await runConfig(
      [],
      { reset: true },
      itStrings,
      stdout.stream,
      stderr.stream,
      true,
    );
    expect(exitCode).toBe(0);
    const line = stdout.output().trimEnd();
    expect(line.startsWith(GREEN)).toBe(true);
    expect(stripAnsi(line)).toContain("Configurazione ripristinata");
  });

  it("--show colors the current-language line navy, not green", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();
    const exitCode = await runConfig(
      [],
      { show: true },
      itStrings,
      stdout.stream,
      stderr.stream,
      true,
    );
    expect(exitCode).toBe(0);
    const line = stdout.output().trimEnd();
    expect(line.startsWith(NAVY)).toBe(true);
    expect(line).not.toContain(GREEN);
    expect(stripAnsi(line)).toContain("Lingua corrente:");
  });

  it("color: false produces no ANSI escapes for any of the three paths", async () => {
    for (const flags of [{ lang: "en" }, { reset: true }, { show: true }]) {
      const stdout = makeWritable();
      const stderr = makeWritable();
      await runConfig([], flags, itStrings, stdout.stream, stderr.stream, false);
      expect(stdout.output()).toBe(stripAnsi(stdout.output()));
    }
  });

  it("stripping color yields byte-identical text to the uncolored run", async () => {
    for (const flags of [{ lang: "en" }, { reset: true }, { show: true }]) {
      const colored = makeWritable();
      const uncolored = makeWritable();
      await runConfig(
        [],
        flags,
        itStrings,
        colored.stream,
        makeWritable().stream,
        true,
      );
      await runConfig(
        [],
        flags,
        itStrings,
        uncolored.stream,
        makeWritable().stream,
        false,
      );
      expect(stripAnsi(colored.output())).toBe(uncolored.output());
    }
  });

  it("hard errors (unsupported locale) stay unstyled — left to Task 63's shared pass", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();
    const exitCode = await runConfig(
      [],
      { lang: "fr" },
      itStrings,
      stdout.stream,
      stderr.stream,
      true,
    );
    expect(exitCode).toBe(2);
    expect(stderr.output()).toBe(stripAnsi(stderr.output()));
  });
});
