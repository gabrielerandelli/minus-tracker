import { describe, it, expect, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import type { Transaction } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";
import { ClassificationError } from "../src/errors.js";

const tempSidecar = path.join(
  os.tmpdir(),
  `tc-050-${Date.now()}.classify.json`,
);

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

describe("TC-050: persistent 5xx from OpenFIGI → ClassificationError(NETWORK_ERROR)", () => {
  it("throws ClassificationError with code NETWORK_ERROR after retry exhausted", async () => {
    const mockHttp = vi.fn().mockResolvedValue({ status: 500, data: "" });

    const classifier = new Classifier({ interactive: false });

    await expect(
      classifier.classify([tx], tempSidecar, undefined, mockHttp),
    ).rejects.toMatchObject({
      name: "ClassificationError",
      code: "NETWORK_ERROR",
    });
  });

  it("retries once (mock called twice) before throwing", async () => {
    const mockHttp = vi.fn().mockResolvedValue({ status: 500, data: "" });

    const classifier = new Classifier({ interactive: false });

    await expect(
      classifier.classify([tx], tempSidecar, undefined, mockHttp),
    ).rejects.toBeInstanceOf(ClassificationError);

    // One initial attempt + one retry = 2 calls total
    expect(mockHttp).toHaveBeenCalledTimes(2);
  });
});
