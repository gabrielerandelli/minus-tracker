import { describe, it, expect, vi } from "vitest";
import type { Transaction } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

// A path whose parent directory does not exist — writeFileSync will throw ENOENT
const badSidecarPath = "/nonexistent/dir/tc-051.classify.json";

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

describe("TC-051: unwritable sidecar path → ClassificationError(WRITE_ERROR)", () => {
  it("throws ClassificationError with code WRITE_ERROR", async () => {
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([{ data: [{ securityType: "ETF" }] }]),
    });

    const classifier = new Classifier({ interactive: false });

    await expect(
      classifier.classify([tx], badSidecarPath, undefined, mockHttp),
    ).rejects.toMatchObject({
      name: "ClassificationError",
      code: "WRITE_ERROR",
    });
  });
});
