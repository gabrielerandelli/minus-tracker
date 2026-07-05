import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Transaction } from "../../src/types.js";
import {
  handleClassifyInstruments,
  type ProgressNotification,
} from "../../src/mcp/tools/classify-instruments.js";

/**
 * Category 20 — MCP Server: Tools (v0.8.0)
 *
 * Covers TC-108–TC-112 from docs/test_plan/15-mcp-server-tools.md.
 * Unit-level: calls `handleClassifyInstruments` directly, no MCP transport.
 */

const ISIN_A = "US0378331005";
const ISIN_B = "IE00B4L5Y983";

function makeTransaction(isin: string, product: string): Transaction {
  return {
    isin,
    product,
    date: "2024-01-10",
    type: "BUY",
    quantity: 10,
    pricePerUnit: 100,
    currency: "EUR",
    totalLocal: -1000,
    totalEUR: 1000,
    feesEUR: 0,
  };
}

function jsonResult(status: number, data: unknown) {
  return { status, data: JSON.stringify(data) };
}

describe("TC-108: classify_instruments — basic stateless classify writes no sidecar file", () => {
  it("resolves with classification populated and creates no *.classify.json file", async () => {
    const tx = makeTransaction(ISIN_A, "Apple Inc");
    const mockHttp = vi
      .fn()
      .mockResolvedValue(
        jsonResult(200, [{ data: [{ securityType: "Common Stock" }] }]),
      );

    const tmpDir = os.tmpdir();
    const before = fs.readdirSync(tmpDir);

    const result = await handleClassifyInstruments(
      { transactions: [tx] },
      undefined,
      mockHttp,
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text as string);
    expect(body.classification[ISIN_A]).toBeDefined();
    expect(body.classification[ISIN_A].assetClass).toBe("Stock");

    const after = fs.readdirSync(tmpDir);
    const newFiles = after.filter((f) => !before.includes(f));
    expect(newFiles.some((f) => f.endsWith(".classify.json"))).toBe(false);
  });
});

describe("TC-109: classify_instruments — overrides round-trip resolves an unknown-type ISIN", () => {
  it("surfaces an unresolved-ISIN warning, then resolves it via overrides without re-querying the resolved ISIN", async () => {
    const txA = makeTransaction(ISIN_A, "Unknown Co");
    const txB = makeTransaction(ISIN_B, "iShares MSCI World ETF");

    const mockHttp = vi.fn().mockImplementation(async (_url, body: string) => {
      const items = JSON.parse(body) as Array<{ idValue: string }>;
      return jsonResult(
        200,
        items.map((item) =>
          item.idValue === ISIN_A
            ? { data: [{ securityType: "REIT" }] }
            : { data: [{ securityType: "ETF" }] },
        ),
      );
    });

    const result1 = await handleClassifyInstruments(
      { transactions: [txA, txB] },
      undefined,
      mockHttp,
    );

    expect(result1.isError).toBeUndefined();
    const body1 = JSON.parse(result1.content[0].text as string);
    expect(body1.warnings.some((w: string) => w.includes(ISIN_A))).toBe(true);
    expect(body1.classification[ISIN_B].assetClass).toBe("ETF");

    expect(mockHttp).toHaveBeenCalledTimes(1);
    mockHttp.mockClear();

    const result2 = await handleClassifyInstruments(
      {
        transactions: [txA, txB],
        existingClassification: body1.classification,
        overrides: { [ISIN_A]: "Stock" },
      },
      undefined,
      mockHttp,
    );

    expect(result2.isError).toBeUndefined();
    const body2 = JSON.parse(result2.content[0].text as string);
    expect(body2.classification[ISIN_A].assetClass).toBe("Stock");
    expect(body2.classification[ISIN_A].source).toBe("user");
    expect(body2.warnings).toEqual([]);

    // Neither ISIN should be re-queried: ISIN_A is settled by the override,
    // ISIN_B is preserved as-is from existingClassification.
    expect(mockHttp).not.toHaveBeenCalled();
  });
});

describe("TC-110: classify_instruments — offline: true skips OpenFIGI entirely", () => {
  it("makes zero OpenFIGI calls and returns unresolved ISINs as unknown-type stubs", async () => {
    const tx = makeTransaction(ISIN_A, "Unknown Co");
    const mockHttp = vi.fn();

    const result = await handleClassifyInstruments(
      { transactions: [tx], offline: true },
      undefined,
      mockHttp,
    );

    expect(result.isError).toBeUndefined();
    expect(mockHttp).not.toHaveBeenCalled();

    const body = JSON.parse(result.content[0].text as string);
    expect(body.classification[ISIN_A].assetClass).toBe("Stock");
    expect(body.classification[ISIN_A].confirmedByUser).toBe(false);
    expect(body.classification[ISIN_A].source).toBe("user");
    expect(body.warnings.some((w: string) => w.includes(ISIN_A))).toBe(true);
  });
});

describe("TC-111: classify_instruments — NETWORK_ERROR mapped to isError result", () => {
  it("returns isError: true with code NETWORK_ERROR when OpenFIGI returns 503", async () => {
    const tx = makeTransaction(ISIN_A, "Apple Inc");
    const mockHttp = vi.fn().mockResolvedValue({ status: 503, data: "" });

    const result = await handleClassifyInstruments(
      { transactions: [tx] },
      undefined,
      mockHttp,
    );

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.code).toBe("NETWORK_ERROR");
    expect(typeof body.message).toBe("string");
  });
});

describe("TC-112: classify_instruments — progress notifications only sent with a progressToken", () => {
  const ISINS = Array.from(
    { length: 25 },
    (_, i) => `XX${String(i).padStart(10, "0")}`,
  );

  const transactions: Transaction[] = ISINS.map((isin, i) =>
    makeTransaction(isin, `Test Stock ${i}`),
  );

  function makeMockHttp() {
    return vi.fn().mockImplementation(async (_url: string, body: string) => {
      const items = JSON.parse(body) as unknown[];
      return jsonResult(
        200,
        items.map(() => ({ data: [{ securityType: "Common Stock" }] })),
      );
    });
  }

  it("sends 3 notifications/progress messages with a progressToken, 0 without, and both calls return identical results", async () => {
    vi.useFakeTimers();
    try {
      const mockHttpWithToken = makeMockHttp();
      const sendNotification = vi
        .fn<(n: ProgressNotification) => Promise<void>>()
        .mockResolvedValue(undefined);

      const withTokenPromise = handleClassifyInstruments(
        { transactions },
        { _meta: { progressToken: "abc" }, sendNotification },
        mockHttpWithToken,
      );

      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(6000);

      const resultWithToken = await withTokenPromise;

      expect(sendNotification).toHaveBeenCalledTimes(3);
      expect(sendNotification).toHaveBeenNthCalledWith(1, {
        method: "notifications/progress",
        params: { progressToken: "abc", progress: 1, total: 3 },
      });
      expect(sendNotification).toHaveBeenNthCalledWith(2, {
        method: "notifications/progress",
        params: { progressToken: "abc", progress: 2, total: 3 },
      });
      expect(sendNotification).toHaveBeenNthCalledWith(3, {
        method: "notifications/progress",
        params: { progressToken: "abc", progress: 3, total: 3 },
      });

      const mockHttpNoToken = makeMockHttp();
      const withoutTokenPromise = handleClassifyInstruments(
        { transactions },
        undefined,
        mockHttpNoToken,
      );

      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(6000);

      const resultWithoutToken = await withoutTokenPromise;

      expect(resultWithToken.content[0].text).toEqual(
        resultWithoutToken.content[0].text,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends 0 notifications when extra has no progressToken", async () => {
    const mockHttp = makeMockHttp();
    const sendNotification = vi.fn().mockResolvedValue(undefined);

    vi.useFakeTimers();
    try {
      const promise = handleClassifyInstruments(
        { transactions },
        { sendNotification },
        mockHttp,
      );
      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(6000);
      await promise;
    } finally {
      vi.useRealTimers();
    }

    expect(sendNotification).not.toHaveBeenCalled();
  });
});
