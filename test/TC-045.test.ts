import { describe, it, expect } from "vitest";
import { Classifier } from "../src/classifier/index.js";
import { ClassificationError } from "../src/errors.js";

describe("TC-045: missing sidecar", () => {
  it("throws ClassificationError with SIDECAR_NOT_FOUND", async () => {
    const classifier = new Classifier();
    await expect(
      classifier.load("/nonexistent/path.classify.json"),
    ).rejects.toMatchObject({
      name: "ClassificationError",
      code: "SIDECAR_NOT_FOUND",
    });
  });
});
