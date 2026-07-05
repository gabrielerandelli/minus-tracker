import { describe, it, expect, vi, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { Transaction, ClassificationEntry } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

/**
 * TC-061: interactive user override ETF→Stock → bucketGain:"B", source:"user"
 *
 * Full interactive stdin flow is tested at the CLI level (TC-066).
 * At the unit level we verify two things:
 *
 * 1. A user-confirmed Stock override (source:"user", confirmedByUser:true)
 *    stored in the sidecar is preserved verbatim by classify() — the ETF result
 *    OpenFIGI would return is ignored because confirmedByUser:true skips re-processing.
 *
 * 2. The Stock asset class has bucketGain:"B" as required by the tax rules.
 */

const tempSidecar = path.join(
  os.tmpdir(),
  `tc-061-${Date.now()}.classify.json`,
);

const ISIN = "IE00B4L5Y983";

const userOverrideEntry: ClassificationEntry = {
  product: "iShares MSCI World ETF",
  // User corrected OpenFIGI's ETF suggestion to Stock
  assetClass: "Stock",
  bucketGain: "B",
  bucketLoss: "B",
  taxRate: 0,
  whiteListed: null,
  confirmedByUser: true,
  source: "user",
};

afterEach(() => {
  if (fs.existsSync(tempSidecar)) {
    fs.unlinkSync(tempSidecar);
  }
});

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

describe("TC-061: user override ETF→Stock — sidecar preserved, bucketGain=B", () => {
  it("preserves user-confirmed Stock override (source=user, confirmedByUser=true)", async () => {
    // Pre-write a sidecar that represents what the interactive flow would produce
    const sidecar = {
      version: 1,
      generatedAt: new Date().toISOString(),
      classifications: { [ISIN]: userOverrideEntry },
    };
    fs.writeFileSync(tempSidecar, JSON.stringify(sidecar, null, 2), "utf-8");

    // OpenFIGI would say ETF — but since the entry is confirmed, it must not be called
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([{ data: [{ securityType: "ETF" }] }]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify([tx], tempSidecar, undefined, mockHttp);

    const entry = map[ISIN];
    expect(entry).toBeDefined();
    expect(entry!.assetClass).toBe("Stock");
    expect(entry!.source).toBe("user");
    expect(entry!.confirmedByUser).toBe(true);
    expect(mockHttp).not.toHaveBeenCalled();
  });

  it("user-overridden Stock entry has bucketGain=B and bucketLoss=B", async () => {
    const sidecar = {
      version: 1,
      generatedAt: new Date().toISOString(),
      classifications: { [ISIN]: userOverrideEntry },
    };
    fs.writeFileSync(tempSidecar, JSON.stringify(sidecar, null, 2), "utf-8");

    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([{ data: [{ securityType: "ETF" }] }]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify([tx], tempSidecar, undefined, mockHttp);

    expect(map[ISIN]!.bucketGain).toBe("B");
    expect(map[ISIN]!.bucketLoss).toBe("B");
    expect(map[ISIN]!.taxRate).toBe(0);
  });

  it("headless classify of a genuine Stock ISIN sets bucketGain=B via OpenFIGI", async () => {
    // No pre-existing sidecar — fresh classify from OpenFIGI returning Common Stock
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([{ data: [{ securityType: "Common Stock" }] }]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify([tx], tempSidecar, undefined, mockHttp);

    expect(map[ISIN]!.assetClass).toBe("Stock");
    expect(map[ISIN]!.bucketGain).toBe("B");
    expect(map[ISIN]!.source).toBe("openfigi");
  });
});
