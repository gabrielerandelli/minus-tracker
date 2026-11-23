import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Transaction } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

/**
 * Regression: Classifier.load() only checked `typeof parsed === "object"`
 * and `parsed.version === 1` before returning
 * `(parsed as { classifications: ClassificationMap }).classifications`. A
 * sidecar that is valid JSON, version 1, but has its "classifications" key
 * missing entirely (or explicitly set to `null`) therefore made load()
 * silently return `undefined` with no error thrown at all.
 *
 * That broke classify()'s own sidecar-mode branch:
 *
 *   const existingMap = await this.load(sidecarPath);
 *   for (const [isin, entry] of Object.entries(existingMap)) { ... }
 *
 * `Object.entries(undefined)` throws a raw, unhandled
 * "TypeError: Cannot convert undefined or null to object" — not a typed
 * ClassificationError — violating the documented error contract (load()/
 * classify() throw only SIDECAR_NOT_FOUND | SIDECAR_VERSION |
 * SIDECAR_MALFORMED | WRITE_ERROR | NETWORK_ERROR for malformed sidecar
 * content; see TC-045/TC-046/TC-047).
 *
 * This is exactly the kind of malformed-but-"valid JSON, right version"
 * input SIDECAR_MALFORMED already exists to cover (previously only for
 * JSON.parse() failures) — a half-written edit, a merge conflict, or an
 * interrupted write can easily leave a sidecar at `{"version": 1}` with no
 * "classifications" field, since the sidecar is documented as hand-editable.
 *
 * Fix: load() now additionally validates that "classifications" is present
 * and is a genuine plain object (not undefined, not null, not an array)
 * before returning it, throwing SIDECAR_MALFORMED otherwise — consistent
 * with how SIDECAR_MALFORMED already covers other malformed-content cases.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const missingClassificationsFixture = path.join(
  __dirname,
  "fixtures/sidecar-missing-classifications.json",
);
const nullClassificationsFixture = path.join(
  __dirname,
  "fixtures/sidecar-null-classifications.json",
);

const tx: Transaction = {
  isin: "XX0000000999",
  product: "Unknown Asset",
  date: "2024-01-10",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 50,
  currency: "EUR",
  totalLocal: -500,
  totalEUR: 500,
  feesEUR: 0,
};

describe('regression: sidecar with version 1 but missing/null "classifications" no longer bypasses error handling', () => {
  it('load() throws ClassificationError SIDECAR_MALFORMED when "classifications" key is absent', async () => {
    const classifier = new Classifier();
    await expect(
      classifier.load(missingClassificationsFixture),
    ).rejects.toMatchObject({
      name: "ClassificationError",
      code: "SIDECAR_MALFORMED",
    });
  });

  it('load() throws ClassificationError SIDECAR_MALFORMED when "classifications" is explicitly null', async () => {
    const classifier = new Classifier();
    await expect(
      classifier.load(nullClassificationsFixture),
    ).rejects.toMatchObject({
      name: "ClassificationError",
      code: "SIDECAR_MALFORMED",
    });
  });

  it("classify() with such a sidecar throws ClassificationError SIDECAR_MALFORMED, not a raw TypeError", async () => {
    const mockHttp = vi.fn();
    const classifier = new Classifier();
    await expect(
      classifier.classify(
        [tx],
        missingClassificationsFixture,
        { offline: true },
        mockHttp,
      ),
    ).rejects.toMatchObject({
      name: "ClassificationError",
      code: "SIDECAR_MALFORMED",
    });
    expect(mockHttp).not.toHaveBeenCalled();
  });

  it("classify() with a null-classifications sidecar also throws ClassificationError SIDECAR_MALFORMED", async () => {
    const classifier = new Classifier();
    await expect(
      classifier.classify([tx], nullClassificationsFixture, {
        offline: true,
      }),
    ).rejects.toMatchObject({
      name: "ClassificationError",
      code: "SIDECAR_MALFORMED",
    });
  });
});
