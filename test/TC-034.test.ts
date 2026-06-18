import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveLocale } from "../src/i18n/settings.js";

let savedMinusTrackerLang: string | undefined;
let savedXdgConfigHome: string | undefined;
const tmpDirs: string[] = [];

beforeEach(() => {
  savedMinusTrackerLang = process.env.MINUS_TRACKER_LANG;
  savedXdgConfigHome = process.env.XDG_CONFIG_HOME;
  // Start each test with a clean env
  delete process.env.MINUS_TRACKER_LANG;
});

afterEach(() => {
  // Restore env vars
  if (savedMinusTrackerLang === undefined) {
    delete process.env.MINUS_TRACKER_LANG;
  } else {
    process.env.MINUS_TRACKER_LANG = savedMinusTrackerLang;
  }
  if (savedXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = savedXdgConfigHome;
  }
});

afterAll(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

describe("TC-034 — Locale resolution priority order", () => {
  it("Case 1: MINUS_TRACKER_LANG=en, no CLI lang → returns 'en'", () => {
    // Point XDG_CONFIG_HOME to an empty temp dir to avoid config file interference
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-test-"));
    tmpDirs.push(tmpDir);
    process.env.XDG_CONFIG_HOME = tmpDir;

    process.env.MINUS_TRACKER_LANG = "en";

    expect(resolveLocale(undefined)).toBe("en");
  });

  it("Case 2: MINUS_TRACKER_LANG=en, CLI lang='it' → returns 'it' (flag wins)", () => {
    // Point XDG_CONFIG_HOME to an empty temp dir to avoid config file interference
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-test-"));
    tmpDirs.push(tmpDir);
    process.env.XDG_CONFIG_HOME = tmpDir;

    process.env.MINUS_TRACKER_LANG = "en";

    expect(resolveLocale("it")).toBe("it");
  });

  it("Case 3: no env var; config file locale='en' → returns 'en'", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-test-"));
    tmpDirs.push(tmpDir);
    process.env.XDG_CONFIG_HOME = tmpDir;

    // Write config file with locale=en
    const configDir = path.join(tmpDir, "minus-tracker");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ locale: "en" }),
    );

    // No env var set (already deleted in beforeEach)
    expect(resolveLocale(undefined)).toBe("en");
  });

  it("Case 4: no env var, no config → returns 'it' (default)", () => {
    // Empty temp dir — no config file present
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-empty-"));
    tmpDirs.push(emptyDir);
    process.env.XDG_CONFIG_HOME = emptyDir;

    // No env var set (already deleted in beforeEach)
    expect(resolveLocale(undefined)).toBe("it");
  });
});
