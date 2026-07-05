import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * TC-118: Packaging — `minus-tracker-mcp` bin present; SDK is a runtime dependency.
 */
describe("TC-118 — package.json bin/dependency wiring for the MCP server", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"),
  );

  it("Step 1: bin contains both minus-tracker and minus-tracker-mcp, distinct entrypoints", () => {
    expect(pkg.bin["minus-tracker"]).toBeDefined();
    expect(pkg.bin["minus-tracker-mcp"]).toBeDefined();
    expect(pkg.bin["minus-tracker"]).not.toBe(pkg.bin["minus-tracker-mcp"]);
  });

  it("Step 2: dependencies contains @modelcontextprotocol/sdk", () => {
    expect(pkg.dependencies).toBeDefined();
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBeDefined();
  });

  it("Step 3: devDependencies does NOT also list the SDK", () => {
    expect(pkg.devDependencies["@modelcontextprotocol/sdk"]).toBeUndefined();
  });
});

/**
 * TC-119: Core library bundle excludes the MCP SDK — zero-runtime-deps preserved
 * elsewhere. Assumes `npm run build` has already produced `dist/`.
 */
describe("TC-119 — dist output isolates the MCP SDK to the mcp build target", () => {
  it("Step 1: dist/index.js does NOT import @modelcontextprotocol/sdk", () => {
    const distIndex = fs.readFileSync(
      path.join(__dirname, "../../dist/index.js"),
      "utf8",
    );
    expect(distIndex).not.toContain("@modelcontextprotocol/sdk");
  });

  it("Step 2: dist/cli/index.js does NOT import @modelcontextprotocol/sdk", () => {
    const distCli = fs.readFileSync(
      path.join(__dirname, "../../dist/cli/index.js"),
      "utf8",
    );
    expect(distCli).not.toContain("@modelcontextprotocol/sdk");
  });

  it("Step 3: dist/mcp/index.js exists and imports @modelcontextprotocol/sdk", () => {
    const mcpPath = path.join(__dirname, "../../dist/mcp/index.js");
    expect(fs.existsSync(mcpPath)).toBe(true);
    const distMcp = fs.readFileSync(mcpPath, "utf8");
    expect(distMcp).toContain("@modelcontextprotocol/sdk");
  });
});
