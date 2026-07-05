import { describe, it, expect, vi } from "vitest";
import type {
  Transaction,
  ClassificationEntry,
  ClassificationMap,
} from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

/**
 * TC-099: existingClassification entries preserved as-is, regardless of
 * confirmedByUser.
 *
 * Unlike sidecar-mode merge, stateless mode does not re-process entries with
 * confirmedByUser: false — any ISIN present in existingClassification is
 * trusted and returned unchanged.
 */

const ISIN_A = "US0378331005";
const ISIN_B = "IE00B4L5Y983";

const existingEntry: ClassificationEntry = {
  product: "Apple Inc",
  assetClass: "Stock",
  bucketGain: "B",
  bucketLoss: "B",
  taxRate: 0,
  whiteListed: null,
  confirmedByUser: false,
  source: "openfigi",
};

const existingClassification: ClassificationMap = {
  [ISIN_A]: existingEntry,
};

const txA: Transaction = {
  isin: ISIN_A,
  product: "Apple Inc",
  date: "2024-01-10",
  type: "BUY",
  quantity: 5,
  pricePerUnit: 180,
  currency: "USD",
  totalLocal: -900,
  totalEUR: 830,
  feesEUR: 2,
  fxRate: 1.084,
};

const txB: Transaction = {
  isin: ISIN_B,
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

describe("TC-099: stateless mode trusts existingClassification regardless of confirmedByUser", () => {
  it("returns ISIN-A unchanged and calls OpenFIGI only for ISIN-B", async () => {
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([{ data: [{ securityType: "ETF" }] }]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify(
      [txA, txB],
      undefined,
      { existingClassification },
      mockHttp,
    );

    expect(map[ISIN_A]).toEqual(existingEntry);
    expect(map[ISIN_B]!.assetClass).toBe("ETF");

    expect(mockHttp).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockHttp.mock.calls[0]![1] as string) as Array<{
      idValue: string;
    }>;
    const sentIsins = body.map((b) => b.idValue);
    expect(sentIsins).not.toContain(ISIN_A);
    expect(sentIsins).toContain(ISIN_B);
  });
});
