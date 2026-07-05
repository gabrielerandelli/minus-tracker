/**
 * TC-121: stress-test --output-dir never deletes a user-supplied directory
 *
 * Bug: fs.rmSync(outputDir, {recursive:true, force:true}) used to run whenever
 * --keep was absent, regardless of whether outputDir was auto-generated
 * (mkdtemp) or explicitly supplied via --output-dir — silently destroying a
 * real user directory and its pre-existing contents.
 *
 * Fix: only the auto-generated temp dir is ever deleted. A user-supplied
 * --output-dir is never removed automatically, regardless of --keep.
 *
 * This is a true black-box integration test (spawns the built CLI, like a
 * real user would) rather than importing runStressTest directly — the
 * command's manifest-path resolution is relative to the compiled dist/
 * location and does not resolve correctly against the TS source path vitest
 * would otherwise use, which is exactly why TC-043 excludes this command from
 * direct unit testing.
 *
 * Expected:
 *   (a) user-supplied --output-dir with a pre-existing marker file survives a
 *       run without --keep (both the file and the directory itself).
 *   (b) no leftover minus-tracker-stress-* temp dirs after a normal run with
 *       no --output-dir/--keep (regression guard on auto-cleanup).
 *   (c) exactly one new minus-tracker-stress-* temp dir remains after a run
 *       with --keep (regression guard — auto-generated dirs still respect
 *       --keep).
 */

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliBin = path.join(__dirname, "../dist/cli/index.js");

function listStressTempDirs(): Set<string> {
  return new Set(
    fs
      .readdirSync(os.tmpdir())
      .filter((name) => name.startsWith("minus-tracker-stress-")),
  );
}

const dirsToCleanUp: string[] = [];

afterEach(() => {
  for (const dir of dirsToCleanUp.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // already gone or never created — fine
    }
  }
});

describe("TC-121: stress-test --output-dir destructive-delete fix", () => {
  it("(a) user-supplied --output-dir with a pre-existing marker file survives, without --keep", () => {
    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc-121-user-dir-"));
    dirsToCleanUp.push(userDir);
    const markerPath = path.join(userDir, "marker.txt");
    fs.writeFileSync(markerPath, "pre-existing content");

    execFileSync(
      "node",
      [cliBin, "stress-test", "--output-dir", userDir, "--range", "1-1"],
      { encoding: "utf8" },
    );

    expect(fs.existsSync(userDir)).toBe(true);
    expect(fs.existsSync(markerPath)).toBe(true);
  });

  it("(b) no leftover auto-generated temp dir after a normal run without --keep (regression guard)", () => {
    const before = listStressTempDirs();

    execFileSync("node", [cliBin, "stress-test", "--range", "1-1"], {
      encoding: "utf8",
    });

    const after = listStressTempDirs();
    expect(after).toEqual(before);
  });

  it("(c) auto-generated temp dir survives with --keep (regression guard)", () => {
    const before = listStressTempDirs();

    execFileSync("node", [cliBin, "stress-test", "--range", "1-1", "--keep"], {
      encoding: "utf8",
    });

    const after = listStressTempDirs();
    const newDirs = [...after].filter((d) => !before.has(d));
    expect(newDirs.length).toBe(1);
    dirsToCleanUp.push(path.join(os.tmpdir(), newDirs[0]));
  });
});
