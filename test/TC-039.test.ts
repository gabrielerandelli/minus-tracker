import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEGIROParser,
  Calculator,
  ParseError,
  CalculationError,
} from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("TC-039 — Named exports present; i18n not in library bundle", () => {
  it("Step 1: All 4 classes are importable from the library entry point", () => {
    expect(typeof DEGIROParser).toBe("function");
    expect(typeof Calculator).toBe("function");
    expect(typeof ParseError).toBe("function");
    expect(typeof CalculationError).toBe("function");
  });

  it("Step 2: DEGIROParser can be constructed (proves type ecosystem is consistent)", () => {
    const p = new DEGIROParser();
    expect(p).toBeDefined();
  });

  it("Step 3: dist/index.js does NOT import from i18n/", () => {
    const distIndex = fs.readFileSync(
      path.join(__dirname, "../dist/index.js"),
      "utf8",
    );
    expect(distIndex).not.toContain("i18n");
  });

  it("Step 4: Calculator source is independent of DEGIROParser", () => {
    const calcSource = fs.readFileSync(
      path.join(__dirname, "../src/calculator/index.ts"),
      "utf8",
    );
    expect(calcSource).not.toContain("DEGIROParser");
    expect(calcSource).not.toContain("parser");
  });
});
