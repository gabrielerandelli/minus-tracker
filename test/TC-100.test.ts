import { describe, it, expect, vi } from "vitest";
import type {
  Transaction,
  ClassificationEntry,
  ClassificationMap,
} from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

/**
 * TC-100: overrides always wins, even over existingClassification.
 *
 * An ISIN present in overrides is always applied, skipping OpenFIGI even when
 * the same ISIN also appears in existingClassification.
 */

const ISIN_A = "US0378331005";

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

describe("TC-100: overrides always wins, even over existingClassification", () => {
  it("applies override assetClass with confirmedByUser=true, source=user, no OpenFIGI call", async () => {
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify(
      [txA],
      undefined,
      { existingClassification, overrides: { [ISIN_A]: "ETF" } },
      mockHttp,
    );

    expect(map[ISIN_A]!.assetClass).toBe("ETF");
    expect(map[ISIN_A]!.confirmedByUser).toBe(true);
    expect(map[ISIN_A]!.source).toBe("user");
    expect(mockHttp).not.toHaveBeenCalled();
  });
});
