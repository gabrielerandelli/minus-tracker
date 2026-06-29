import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Classifier } from "../src/classifier/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures/sidecar-malformed.json");

describe("TC-047: malformed sidecar JSON", () => {
  it("throws ClassificationError with SIDECAR_MALFORMED", async () => {
    const classifier = new Classifier();
    await expect(classifier.load(fixturePath)).rejects.toMatchObject({
      name: "ClassificationError",
      code: "SIDECAR_MALFORMED",
    });
  });
});
