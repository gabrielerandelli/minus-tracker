import { describe, it, expect, vi, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { Transaction } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

const tempSidecar = path.join(
  os.tmpdir(),
  `tc-048-${Date.now()}.classify.json`,
);

afterEach(() => {
  if (fs.existsSync(tempSidecar)) {
    fs.unlinkSync(tempSidecar);
  }
});

const tx: Transaction = {
  isin: "IE00B4L5Y983",
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

describe("TC-048: headless classify — OpenFIGI ETF response, sidecar written", () => {
  it("returns ETF entry with source=openfigi and confirmedByUser=false", async () => {
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([{ data: [{ securityType: "ETF" }] }]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify([tx], tempSidecar, mockHttp);

    const entry = map["IE00B4L5Y983"];
    expect(entry).toBeDefined();
    expect(entry!.assetClass).toBe("ETF");
    expect(entry!.bucketGain).toBe("A");
    expect(entry!.bucketLoss).toBe("B");
    expect(entry!.taxRate).toBe(0.26);
    expect(entry!.source).toBe("openfigi");
    expect(entry!.confirmedByUser).toBe(false);
  });

  it("writes a valid sidecar file to disk", async () => {
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([{ data: [{ securityType: "ETF" }] }]),
    });

    const classifier = new Classifier({ interactive: false });
    await classifier.classify([tx], tempSidecar, mockHttp);

    expect(fs.existsSync(tempSidecar)).toBe(true);
    const raw = fs.readFileSync(tempSidecar, "utf-8");
    const parsed = JSON.parse(raw) as {
      version: number;
      classifications: Record<string, unknown>;
    };
    expect(parsed.version).toBe(1);
    expect(parsed.classifications["IE00B4L5Y983"]).toBeDefined();
  });

  it("sets product from the transaction", async () => {
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([{ data: [{ securityType: "ETF" }] }]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify([tx], tempSidecar, mockHttp);

    expect(map["IE00B4L5Y983"]!.product).toBe("iShares MSCI World ETF");
  });
});
