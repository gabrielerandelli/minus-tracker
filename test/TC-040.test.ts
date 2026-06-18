import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.join(__dirname, "../.github/workflows/release.yml");

describe("TC-040 — Release workflow YAML exists and has expected structure", () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(workflowPath, "utf8");
  });

  it("Step 1: workflow file exists", () =>
    expect(fs.existsSync(workflowPath)).toBe(true));

  it("Step 2: triggers on v* tag push", () => {
    expect(content).toContain("tags:");
    expect(content).toContain("v*");
  });

  it("Step 3: GitHub Packages registry URL", () =>
    expect(content).toContain("npm.pkg.github.com"));

  it("Step 4: npm publish step", () =>
    expect(content).toContain("npm publish"));

  it("Step 5: GitHub Release action", () =>
    expect(content).toContain("softprops/action-gh-release"));

  it("Step 6: auto-generated release notes", () =>
    expect(content).toContain("generate_release_notes: true"));

  it("Step 7: packages: write permission", () =>
    expect(content).toContain("packages: write"));

  it("Step 8: contents: write permission", () =>
    expect(content).toContain("contents: write"));
});
