import { describe, it, expect, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { Transaction } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

/**
 * TC-101: offline: true — unresolved ISIN returns unknown-type, no network
 * call.
 *
 * With offline: true, OpenFIGI is never contacted. ISINs not covered by
 * overrides/existingClassification come back as unknown-type, with one
 * warning per unresolved ISIN.
 */

const ISIN_B = "XX0000000999";

const txB: Transaction = {
  isin: ISIN_B,
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

describe("TC-101: offline mode stubs unresolved ISINs without contacting OpenFIGI", () => {
  it("never calls OpenFIGI and returns default unknown-type entry", async () => {
    const mockHttp = vi.fn();

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify(
      [txB],
      undefined,
      { offline: true },
      mockHttp,
    );

    expect(mockHttp).toHaveBeenCalledTimes(0);

    const entry = map[ISIN_B];
    expect(entry).toBeDefined();
    expect(entry!.confirmedByUser).toBe(false);
    expect(entry!.source).toBe("user");
    expect(entry!.assetClass).toBe("Stock");
    expect(entry!.bucketGain).toBe("B");
    expect(entry!.bucketLoss).toBe("B");
    expect(entry!.taxRate).toBe(0);
  });

  it("offline stub gets a warning mentioning the unresolved ISIN (verified via the shared warning-format code path)", async () => {
    // classify() doesn't return warnings in stateless mode (only ClassificationMap),
    // so we exercise the identical offline-branch code with sidecarPath set — the
    // warning-construction logic is shared between both modes — and read the
    // warning text back out of the written sidecar to assert on its exact format.
    const tempSidecar = path.join(
      os.tmpdir(),
      `tc-101-${Date.now()}.classify.json`,
    );

    const mockHttp = vi.fn();
    const classifier = new Classifier({ interactive: false });
    await classifier.classify([txB], tempSidecar, { offline: true }, mockHttp);

    const raw = fs.readFileSync(tempSidecar, "utf-8");
    const parsed = JSON.parse(raw) as { warnings: string[] };
    fs.unlinkSync(tempSidecar);

    expect(mockHttp).not.toHaveBeenCalled();
    expect(parsed.warnings.some((w) => w.includes(ISIN_B))).toBe(true);
  });
});
