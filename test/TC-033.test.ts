import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { Writable } from "node:stream";
import { runConfig } from "../src/cli/commands/config.js";
import { it as itStrings } from "../src/i18n/it.js";
import { en as enStrings } from "../src/i18n/en.js";

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

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-test-"));
  originalXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = tmpDir;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (originalXdg === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdg;
  }
});

describe("TC-033 — config persists and reads locale", () => {
  it("step 1: --lang en exits 0 and prints 'Language set to: en'", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();

    const exitCode = await runConfig(
      [],
      { lang: "en" },
      enStrings,
      stdout.stream,
      stderr.stream,
    );

    expect(exitCode).toBe(0);
    expect(stdout.output()).toContain("Language set to: en");
  });

  it("step 2: --show exits 0 and prints 'Current language: en'", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();

    const exitCode = await runConfig(
      [],
      { show: true },
      enStrings,
      stdout.stream,
      stderr.stream,
    );

    expect(exitCode).toBe(0);
    expect(stdout.output()).toContain("Current language: en");
  });

  it("step 3: --lang it exits 0 and prints 'Lingua impostata su: it'", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();

    const exitCode = await runConfig(
      [],
      { lang: "it" },
      itStrings,
      stdout.stream,
      stderr.stream,
    );

    expect(exitCode).toBe(0);
    expect(stdout.output()).toContain("Lingua impostata su: it");
  });

  it("step 4: --show exits 0 and prints 'Lingua corrente: it'", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();

    const exitCode = await runConfig(
      [],
      { show: true },
      itStrings,
      stdout.stream,
      stderr.stream,
    );

    expect(exitCode).toBe(0);
    expect(stdout.output()).toContain("Lingua corrente: it");
  });

  it("config file is persisted at XDG_CONFIG_HOME/minus-tracker/config.json", () => {
    const configPath = path.join(tmpDir, "minus-tracker", "config.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as { locale?: string };
    expect(parsed.locale).toBe("it");
  });
});
