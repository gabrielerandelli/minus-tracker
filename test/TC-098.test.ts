import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import type { Transaction } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

/**
 * TC-098: classify() with sidecarPath omitted — no filesystem access.
 *
 * Stateless mode must perform zero disk I/O: no existsSync, no readFileSync,
 * no writeFileSync, no mkdir. The returned map is built purely from
 * existingClassification + overrides + OpenFIGI lookups.
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

describe("TC-098: stateless classify — no filesystem access", () => {
  it("returns a ClassificationMap without touching the filesystem", async () => {
    const existsSyncSpy = vi.spyOn(fs, "existsSync");
    const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync");
    const mkdirSpy = vi.spyOn(fs, "mkdirSync");

    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([
        { data: [{ securityType: "ETP", securityType2: "ETF" }] },
      ]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify([tx], undefined, {}, mockHttp);

    expect(existsSyncSpy).not.toHaveBeenCalled();
    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();

    expect(map[ISIN]).toBeDefined();
    expect(map[ISIN]!.assetClass).toBe("ETF");

    existsSyncSpy.mockRestore();
    writeFileSyncSpy.mockRestore();
    mkdirSpy.mockRestore();
  });
});
