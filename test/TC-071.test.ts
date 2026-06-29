import { describe, it, expect } from "vitest";
import { Classifier, ClassificationError } from "../src/index.js";
import type {
  ClassificationMap,
  ClassificationEntry,
  AssetClass,
  BucketAReport,
  BucketBReport,
  BucketAGroup,
  CarryForward,
  CalculatorOptions,
} from "../src/index.js";
import * as fs from "node:fs";

describe("TC-071: v0.6.0 public API exports", () => {
  it("Classifier and ClassificationError are exported as values", () => {
    expect(Classifier).toBeDefined();
    expect(ClassificationError).toBeDefined();
  });

  it("ClassificationError has .code field with all 5 codes", () => {
    const e1 = new ClassificationError("NETWORK_ERROR");
    expect(e1.code).toBe("NETWORK_ERROR");
    expect(e1.name).toBe("ClassificationError");

    const e2 = new ClassificationError("SIDECAR_NOT_FOUND");
    expect(e2.code).toBe("SIDECAR_NOT_FOUND");

    const e3 = new ClassificationError("SIDECAR_VERSION");
    expect(e3.code).toBe("SIDECAR_VERSION");

    const e4 = new ClassificationError("SIDECAR_MALFORMED");
    expect(e4.code).toBe("SIDECAR_MALFORMED");

    const e5 = new ClassificationError("WRITE_ERROR");
    expect(e5.code).toBe("WRITE_ERROR");
  });

  it("all type exports are accessible (type check only)", () => {
    // Type imports (ClassificationMap, ClassificationEntry, AssetClass, etc.) are compile-time only.
    // If this file compiles and runs without error, all type exports are present.
    // Use a runtime value to confirm the module loaded correctly.
    expect(typeof Classifier).toBe("function");
  });

  it("src/index.ts does not re-export i18n symbols", () => {
    const content = fs.readFileSync(
      new URL("../src/index.ts", import.meta.url),
      "utf-8",
    );
    expect(content).not.toContain("i18n");
  });
});
