import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import type { Transaction } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";
import { ClassificationError } from "../src/errors.js";

/**
 * TC-103: stateless mode NETWORK_ERROR still throws; sidecar-only codes
 * unreachable.
 *
 * NETWORK_ERROR is the only ClassificationError reachable when sidecarPath is
 * omitted — SIDECAR_NOT_FOUND, SIDECAR_VERSION, WRITE_ERROR all require
 * sidecar-mode disk I/O (this.load() / fs.writeFileSync), neither of which is
 * ever called when sidecarPath is undefined (see TC-098's spy assertions,
 * which prove fs.existsSync/fs.writeFileSync are never invoked in that mode —
 * so those branches are structurally unreachable, not merely untested).
 */

const ISIN = "IE00B4L5Y983";

const tx: Transaction = {
  isin: ISIN,
  product: "iShares MSCI World ETF",
  date: "2024-01-10",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -1000,
  totalEUR: 1000,
  feesEUR: 0,
};

describe("TC-103: stateless mode only throws NETWORK_ERROR", () => {
  it("throws ClassificationError(NETWORK_ERROR) on persistent 5xx, with no sidecarPath", async () => {
    const mockHttp = vi.fn().mockResolvedValue({ status: 500, data: "" });

    const classifier = new Classifier({ interactive: false });

    await expect(
      classifier.classify([tx], undefined, {}, mockHttp),
    ).rejects.toMatchObject({
      name: "ClassificationError",
      code: "NETWORK_ERROR",
    });
  });

  it("never touches fs (existsSync/writeFileSync) while throwing, proving SIDECAR_NOT_FOUND/SIDECAR_VERSION/WRITE_ERROR are unreachable", async () => {
    const existsSyncSpy = vi.spyOn(fs, "existsSync");
    const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync");

    const mockHttp = vi.fn().mockResolvedValue({ status: 500, data: "" });
    const classifier = new Classifier({ interactive: false });

    await expect(
      classifier.classify([tx], undefined, {}, mockHttp),
    ).rejects.toBeInstanceOf(ClassificationError);

    // load() (which alone can throw SIDECAR_NOT_FOUND/SIDECAR_VERSION) starts
    // with fs.existsSync; the sidecar write (which alone can throw
    // WRITE_ERROR) is fs.writeFileSync. Neither is ever called in stateless
    // mode, so those two codes cannot be produced here.
    expect(existsSyncSpy).not.toHaveBeenCalled();
    expect(writeFileSyncSpy).not.toHaveBeenCalled();

    existsSyncSpy.mockRestore();
    writeFileSyncSpy.mockRestore();
  });
});
