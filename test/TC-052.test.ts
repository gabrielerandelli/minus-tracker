import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { Transaction, ClassificationEntry } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

const tempSidecar = path.join(
  os.tmpdir(),
  `tc-052-${Date.now()}.classify.json`,
);

// ISIN A: already confirmed by user → must be preserved unchanged
const ISIN_A = "IE00B4L5Y983";
// ISIN B: in sidecar but NOT confirmed → must be re-processed
const ISIN_B = "US0378331005";
// ISIN C: brand new, not in sidecar → must be added
const ISIN_C = "DE0005140008";

const confirmedEntry: ClassificationEntry = {
  product: "iShares MSCI World ETF",
  assetClass: "ETF",
  bucketGain: "A",
  bucketLoss: "B",
  taxRate: 0.26,
  whiteListed: null,
  confirmedByUser: true,
  source: "openfigi",
};

const unconfirmedEntry: ClassificationEntry = {
  product: "Apple Inc",
  assetClass: "Stock",
  bucketGain: "B",
  bucketLoss: "B",
  taxRate: 0,
  whiteListed: null,
  confirmedByUser: false,
  source: "openfigi",
};

beforeEach(() => {
  const sidecar = {
    version: 1,
    generatedAt: new Date().toISOString(),
    classifications: {
      [ISIN_A]: confirmedEntry,
      [ISIN_B]: unconfirmedEntry,
    },
  };
  fs.writeFileSync(tempSidecar, JSON.stringify(sidecar, null, 2), "utf-8");
});

afterEach(() => {
  if (fs.existsSync(tempSidecar)) {
    fs.unlinkSync(tempSidecar);
  }
});

const txA: Transaction = {
  isin: ISIN_A,
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

const txB: Transaction = {
  isin: ISIN_B,
  product: "Apple Inc",
  date: "2024-02-01",
  type: "BUY",
  quantity: 5,
  pricePerUnit: 180,
  currency: "USD",
  totalLocal: -900,
  totalEUR: 830,
  feesEUR: 2,
  fxRate: 1.084,
};

const txC: Transaction = {
  isin: ISIN_C,
  product: "Deutsche Bank AG",
  date: "2024-03-01",
  type: "BUY",
  quantity: 20,
  pricePerUnit: 12,
  currency: "EUR",
  totalLocal: -240,
  totalEUR: 240,
  feesEUR: 1,
};

describe("TC-052: sidecar merge — confirmed preserved, unconfirmed re-processed, new added", () => {
  it("preserves confirmedByUser:true entry unchanged", async () => {
    // Batch will contain B and C; mock returns Common Stock for B, ETF for C
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([
        { data: [{ securityType: "Common Stock" }] },
        { data: [{ securityType: "Common Stock" }] },
      ]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify(
      [txA, txB, txC],
      tempSidecar,
      mockHttp,
    );

    // A must be identical to the original confirmed entry
    expect(map[ISIN_A]).toMatchObject({
      assetClass: "ETF",
      confirmedByUser: true,
      source: "openfigi",
    });
  });

  it("re-processes unconfirmed entry B with fresh OpenFIGI result", async () => {
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([
        { data: [{ securityType: "Common Stock" }] },
        { data: [{ securityType: "Common Stock" }] },
      ]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify(
      [txA, txB, txC],
      tempSidecar,
      mockHttp,
    );

    // B was unconfirmed — it should have been re-queried, now source=openfigi
    expect(map[ISIN_B]).toMatchObject({
      source: "openfigi",
      confirmedByUser: false,
    });
  });

  it("adds new ISIN C to the map", async () => {
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([
        { data: [{ securityType: "Common Stock" }] },
        { data: [{ securityType: "Common Stock" }] },
      ]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify(
      [txA, txB, txC],
      tempSidecar,
      mockHttp,
    );

    expect(map[ISIN_C]).toBeDefined();
    expect(map[ISIN_C]!.source).toBe("openfigi");
  });

  it("does not call OpenFIGI for confirmed ISIN A", async () => {
    // Batch only contains B and C (A is confirmed, skipped)
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([
        { data: [{ securityType: "Common Stock" }] },
        { data: [{ securityType: "Common Stock" }] },
      ]),
    });

    const classifier = new Classifier({ interactive: false });
    await classifier.classify([txA, txB, txC], tempSidecar, mockHttp);

    // One batch call with 2 ISINs (B and C); A was not sent
    expect(mockHttp).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockHttp.mock.calls[0]![1] as string) as Array<{
      idValue: string;
    }>;
    const sentIsins = body.map((b) => b.idValue);
    expect(sentIsins).not.toContain(ISIN_A);
    expect(sentIsins).toContain(ISIN_B);
    expect(sentIsins).toContain(ISIN_C);
  });
});
