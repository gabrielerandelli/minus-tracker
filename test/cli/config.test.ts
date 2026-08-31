import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { Writable } from "node:stream";
import { runConfig } from "../../src/cli/commands/config.js";
import { resolveLocale } from "../../src/i18n/settings.js";
import { it as itStrings } from "../../src/i18n/it.js";
import { en as enStrings } from "../../src/i18n/en.js";

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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-test-reset-"));
  originalXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpDir;
  originalLangEnv = process.env.MINUS_TRACKER_LANG;
  delete process.env.MINUS_TRACKER_LANG;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (originalXdg === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdg;
  }
  if (originalLangEnv === undefined) {
    delete process.env.MINUS_TRACKER_LANG;
  } else {
    process.env.MINUS_TRACKER_LANG = originalLangEnv;
  }
});

function configPath(): string {
  return path.join(tmpDir, "minus-tracker", "config.json");
}

function carryForwardPath(): string {
  return path.join(tmpDir, "minus-tracker", "carryforward.json");
}

function writeConfig(locale: string): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(
    configPath(),
    JSON.stringify({ locale }, null, 2) + "\n",
    "utf8",
  );
}

describe("TC-167 — config --reset deletes config.json; resolveLocale() falls through", () => {
  it("deletes an existing config.json", async () => {
    writeConfig("en");
    expect(fs.existsSync(configPath())).toBe(true);

    const stdout = makeWritable();
    const stderr = makeWritable();
    const exitCode = await runConfig(
      [],
      { reset: true },
      itStrings,
      stdout.stream,
      stderr.stream,
    );

    expect(exitCode).toBe(0);
    expect(fs.existsSync(configPath())).toBe(false);
  });

  it("after reset, resolveLocale() falls through to the default ('it') when no env var is set", async () => {
    writeConfig("en");

    await runConfig([], { reset: true }, itStrings, makeWritable().stream, makeWritable().stream);

    expect(resolveLocale()).toBe("it");
  });

  it("after reset, resolveLocale() falls through to MINUS_TRACKER_LANG when set", async () => {
    writeConfig("it");

    await runConfig([], { reset: true }, itStrings, makeWritable().stream, makeWritable().stream);

    process.env.MINUS_TRACKER_LANG = "en";
    expect(resolveLocale()).toBe("en");
  });
});

describe("TC-168 — config --reset when config.json already absent", () => {
  it("exits 0 with no error when config.json does not exist", async () => {
    expect(fs.existsSync(configPath())).toBe(false);

    const stdout = makeWritable();
    const stderr = makeWritable();
    const exitCode = await runConfig(
      [],
      { reset: true },
      enStrings,
      stdout.stream,
      stderr.stream,
    );

    expect(exitCode).toBe(0);
    expect(stderr.output()).toBe("");
  });
});

describe("TC-169 — config --reset does not delete or modify carryforward.json", () => {
  it("leaves an existing carryforward.json untouched", async () => {
    writeConfig("en");
    const cfContent =
      JSON.stringify({ losses: [{ year: 2023, amount: 100 }] }, null, 2) +
      "\n";
    fs.mkdirSync(path.dirname(carryForwardPath()), { recursive: true });
    fs.writeFileSync(carryForwardPath(), cfContent, "utf8");

    const stdout = makeWritable();
    const stderr = makeWritable();
    const exitCode = await runConfig(
      [],
      { reset: true },
      itStrings,
      stdout.stream,
      stderr.stream,
    );

    expect(exitCode).toBe(0);
    expect(fs.existsSync(carryForwardPath())).toBe(true);
    expect(fs.readFileSync(carryForwardPath(), "utf8")).toBe(cfContent);
  });
});

describe("TC-170 — config --reset combined with --lang or --show is a usage error", () => {
  it("--reset --lang en exits 2", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();
    const exitCode = await runConfig(
      [],
      { reset: true, lang: "en" },
      enStrings,
      stdout.stream,
      stderr.stream,
    );

    expect(exitCode).toBe(2);
  });

  it("--reset --show exits 2", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();
    const exitCode = await runConfig(
      [],
      { reset: true, show: true },
      enStrings,
      stdout.stream,
      stderr.stream,
    );

    expect(exitCode).toBe(2);
  });

  it("does not delete config.json when the mutual-exclusivity usage error fires", async () => {
    writeConfig("en");

    await runConfig(
      [],
      { reset: true, show: true },
      enStrings,
      makeWritable().stream,
      makeWritable().stream,
    );

    expect(fs.existsSync(configPath())).toBe(true);
  });
});
