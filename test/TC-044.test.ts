import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Classifier } from "../src/classifier/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/test.classify.json");

describe("TC-044: valid sidecar load", () => {
  it("returns ClassificationMap with all expected fields", async () => {
    const classifier = new Classifier();
    const map = await classifier.load(fixturePath);
    expect(map).toHaveProperty("IE00B4L5Y983");
    const entry = map["IE00B4L5Y983"];
    expect(entry.assetClass).toBe("ETF");
    expect(entry.bucketGain).toBe("A");
    expect(entry.bucketLoss).toBe("B");
    expect(entry.taxRate).toBe(0.26);
    expect(entry.confirmedByUser).toBe(true);
    expect(entry.source).toBe("openfigi");
  });
});
