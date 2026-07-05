import { describe, it, expect, vi } from "vitest";
import type { Transaction } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

/**
 * TC-102: onBatchProgress(done, total) fires after each OpenFIGI batch; no-op
 * when offline.
 *
 * 25 unique unresolved ISINs -> 3 batches (10/10/5). Uses fake timers to
 * avoid the real 6s inter-batch throttle (12s of real delay across 2 gaps).
 */

const ISINS = Array.from(
  { length: 25 },
  (_, i) => `XX${String(i).padStart(10, "0")}`,
);

const transactions: Transaction[] = ISINS.map((isin, i) => ({
  isin,
  product: `Test Stock ${i}`,
  date: "2024-01-10",
  type: "BUY",
  quantity: 10,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -1000,
  totalEUR: 1000,
  feesEUR: 0,
}));

function makeMockHttp() {
  return vi.fn().mockImplementation(async (_url: string, body: string) => {
    const items = JSON.parse(body) as unknown[];
    return {
      status: 200,
      data: JSON.stringify(
        items.map(() => ({ data: [{ securityType: "Common Stock" }] })),
      ),
    };
  });
}

describe("TC-102: onBatchProgress liveness callback", () => {
  it("fires 3 times, once per completed batch, as (1,3) (2,3) (3,3)", async () => {
    vi.useFakeTimers();
    try {
      const onBatchProgress = vi.fn();
      const mockHttp = makeMockHttp();
      const classifier = new Classifier({ interactive: false });

      const classifyPromise = classifier.classify(
        transactions,
        undefined,
        { onBatchProgress },
        mockHttp,
      );

      // Two 6s throttle gaps separate the 3 batches (before batch 2 and 3).
      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(6000);

      const map = await classifyPromise;

      expect(Object.keys(map)).toHaveLength(25);
      expect(mockHttp).toHaveBeenCalledTimes(3);
      expect(onBatchProgress).toHaveBeenCalledTimes(3);
      expect(onBatchProgress).toHaveBeenNthCalledWith(1, 1, 3);
      expect(onBatchProgress).toHaveBeenNthCalledWith(2, 2, 3);
      expect(onBatchProgress).toHaveBeenNthCalledWith(3, 3, 3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never fires when offline: true — no batches are run, OpenFIGI is never called", async () => {
    const onBatchProgress = vi.fn();
    const mockHttp = makeMockHttp();
    const classifier = new Classifier({ interactive: false });

    await classifier.classify(
      transactions,
      undefined,
      { offline: true, onBatchProgress },
      mockHttp,
    );

    expect(mockHttp).not.toHaveBeenCalled();
    expect(onBatchProgress).not.toHaveBeenCalled();
  });
});
