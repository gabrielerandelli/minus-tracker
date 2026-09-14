import { describe, it, expect, vi } from "vitest";
import { DEGIROParser } from "../../src/parser/index.js";
import {
  handleCalculateFromCsv,
} from "../../src/mcp/tools/calculate-from-csv.js";
import type { ProgressNotification } from "../../src/mcp/tools/classify-instruments.js";

/**
 * Part 19 (v0.13.0) — `calculate_from_csv` composite MCP tool.
 *
 * Task 65 (core composition/best-effort/carryForward/incomeRows):
 *   TC-236, TC-237, TC-238, TC-239, TC-240, TC-241, TC-242
 * Task 66 (extra forwarding, error-shape parity — this task's own scope):
 *   TC-243, TC-244
 *
 * Unit-level: calls `handleCalculateFromCsv` directly, no MCP transport —
 * TC-245 (protocol-level registration) lives in test/mcp/protocol.test.ts
 * alongside the other tools-registration tests.
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

const STOCK_ISIN = "US0378331005";

const BUY_ROW =
  "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";
const SELL_ROW_GAIN =
  "15-03-2024,14:20,Apple Inc,US0378331005,XNAS,XNAS,-10,180.00,1800.00,EUR,1800.00,EUR,1,-2.00,EUR,1798.00,EUR,abc-456";
const SELL_ROW_LOSS =
  "15-03-2024,14:20,Apple Inc,US0378331005,XNAS,XNAS,-10,120.00,1200.00,EUR,1200.00,EUR,1,-2.00,EUR,1198.00,EUR,abc-789";
const DIVIDEND_ROW =
  "03-06-2024,00:00,DIVIDEND Apple Inc,US0378331005,,,0,,35.00,EUR,35.00,EUR,1,0.00,EUR,35.00,EUR,";

function jsonResult(status: number, data: unknown) {
  return { status, data: JSON.stringify(data) };
}

function stockMockHttp(securityType = "Common Stock") {
  return vi
    .fn()
    .mockResolvedValue(jsonResult(200, [{ data: [{ securityType }] }]));
}

function textBody(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text) as {
    report: {
      warnings: string[];
      bucketA: unknown;
      bucketB: {
        netResult: number;
        carryForwardEntriesRemaining: { annoOrigine: number; importo: number }[];
      };
      dichiarazione: {
        quadroRM: {
          dividendiEsteri: Array<{
            isin: string;
            lordo: number;
            rittenutaEstera: number;
          }>;
        };
      };
    };
    warnings: string[];
    unresolvedIsins: string[];
  };
}

describe("TC-236: calculate_from_csv — every ISIN resolves → full report, unresolvedIsins: []", () => {
  it("resolves cleanly with a full report and no unresolved ISINs", async () => {
    const csv = [HEADER, BUY_ROW, SELL_ROW_GAIN].join("\n");
    const mockHttp = stockMockHttp();

    const result = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttp,
    );

    expect(result.isError).toBeUndefined();
    const body = textBody(result);
    expect(body.unresolvedIsins).toEqual([]);
    expect(body.report).toBeDefined();
    expect(body.report.bucketB.netResult).toBeGreaterThan(0);
  });
});

describe("TC-237: calculate_from_csv — unresolved ISINs → Bucket B default + populated unresolvedIsins", () => {
  it("still returns a full report (not partial/omitted) plus the unresolved ISIN list", async () => {
    const csv = [HEADER, BUY_ROW, SELL_ROW_GAIN].join("\n");

    const result = await handleCalculateFromCsv(
      { csv, method: "LIFO", offline: true },
      undefined,
    );

    expect(result.isError).toBeUndefined();
    const body = textBody(result);
    expect(body.unresolvedIsins).toEqual([STOCK_ISIN]);
    expect(body.warnings.some((w) => w.includes(STOCK_ISIN))).toBe(true);
    // Full report still present (Bucket-B-defaulted, not omitted).
    expect(body.report.bucketB).toBeDefined();
    expect(body.report.bucketB.netResult).toBeGreaterThan(0);
  });
});

describe("TC-238: calculate_from_csv — overrides correction retry resolves previously-unresolved ISINs", () => {
  it("a retry with overrides resolves the ISIN without re-querying it", async () => {
    const csv = [HEADER, BUY_ROW, SELL_ROW_GAIN].join("\n");
    const mockHttp = vi
      .fn()
      .mockResolvedValue(jsonResult(200, [{ data: [{ securityType: "REIT" }] }]));

    const result1 = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttp,
    );
    const body1 = textBody(result1);
    expect(body1.unresolvedIsins).toEqual([STOCK_ISIN]);

    mockHttp.mockClear();

    const result2 = await handleCalculateFromCsv(
      { csv, method: "LIFO", overrides: { [STOCK_ISIN]: "Stock" } },
      undefined,
      mockHttp,
    );
    const body2 = textBody(result2);
    expect(body2.unresolvedIsins).toEqual([]);
    expect(mockHttp).not.toHaveBeenCalled();
  });
});

describe("TC-239: calculate_from_csv — offline: true makes no network call", () => {
  it("makes zero OpenFIGI calls end to end", async () => {
    const csv = [HEADER, BUY_ROW, SELL_ROW_GAIN].join("\n");
    const mockHttp = vi.fn();

    const result = await handleCalculateFromCsv(
      { csv, method: "LIFO", offline: true },
      undefined,
      mockHttp,
    );

    expect(result.isError).toBeUndefined();
    expect(mockHttp).not.toHaveBeenCalled();
  });
});

describe("TC-240: calculate_from_csv — carryForward correctly offsets Bucket A/B figures", () => {
  it("a supplied carryForward entry appears applied/remaining in bucketB", async () => {
    const csv = [HEADER, BUY_ROW, SELL_ROW_LOSS].join("\n");
    const mockHttp = stockMockHttp();

    const withoutCarryForward = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttp,
    );
    const bodyWithout = textBody(withoutCarryForward);

    const withCarryForward = await handleCalculateFromCsv(
      { csv, method: "LIFO", carryForward: [{ year: 2023, amount: 50 }] },
      undefined,
      mockHttp,
    );
    const bodyWith = textBody(withCarryForward);

    // Both calls hit a genuine loss (bucketB): carryForward only changes
    // what's still available/remaining going forward, not this year's own
    // realized loss — so netResult stays identical, while
    // carryForwardEntriesRemaining reflects the supplied entry only when
    // it was actually passed in.
    expect(bodyWithout.report.bucketB.netResult).toBe(
      bodyWith.report.bucketB.netResult,
    );
    expect(bodyWithout.report.bucketB.carryForwardEntriesRemaining).toEqual([]);
    expect(bodyWith.report.bucketB.carryForwardEntriesRemaining).toEqual([
      { annoOrigine: 2023, importo: 50 },
    ]);
  });
});

describe("TC-241: calculate_from_csv — carryForward omitted on a retry silently loses its effect (documented, not fixed)", () => {
  it("a second, stateless call without carryForward carries nothing over from the first call", async () => {
    const csv = [HEADER, BUY_ROW, SELL_ROW_LOSS].join("\n");
    const mockHttp = stockMockHttp();

    const first = await handleCalculateFromCsv(
      { csv, method: "LIFO", carryForward: [{ year: 2023, amount: 50 }] },
      undefined,
      mockHttp,
    );
    const firstBody = textBody(first);
    expect(firstBody.report.bucketB.carryForwardEntriesRemaining).toEqual([
      { annoOrigine: 2023, importo: 50 },
    ]);

    // Retry "forgets" carryForward on purpose (this tool is fully
    // stateless — see docs/prd/19-mcp-server-extensions.md) — a caller must
    // resend it every time, or it's silently lost, as asserted here.
    const retry = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttp,
    );
    const retryBody = textBody(retry);
    expect(retryBody.report.bucketB.carryForwardEntriesRemaining).toEqual([]);
  });
});

describe("TC-242: calculate_from_csv — incomeRows wired internally into calculate_gains", () => {
  it("dichiarazione's dividend fields match a direct parse→calculate flow's incomeRows", async () => {
    const csv = [HEADER, BUY_ROW, SELL_ROW_GAIN, DIVIDEND_ROW].join("\n");
    const mockHttp = stockMockHttp();

    const parser = new DEGIROParser();
    parser.parse(csv);
    expect(parser.incomeRows).toHaveLength(1);

    const result = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttp,
    );
    const body = textBody(result);

    expect(body.report.dichiarazione.quadroRM.dividendiEsteri).toEqual([
      {
        isin: STOCK_ISIN,
        prodotto: "DIVIDEND Apple Inc",
        lordo: 35,
        rittenutaEstera: 0,
      },
    ]);
  });
});

describe("TC-243: calculate_from_csv — error shapes match the granular tools it composes", () => {
  it("ParseError → same shape as parse_transactions (INVALID_CSV)", async () => {
    const result = await handleCalculateFromCsv(
      { csv: "\x00\x00binary garbage\x00\x00", method: "LIFO" },
      undefined,
    );
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.code).toBe("INVALID_CSV");
    expect(typeof body.message).toBe("string");
    expect(body.isin).toBeUndefined();
  });

  it("ClassificationError → same shape as classify_instruments (NETWORK_ERROR)", async () => {
    const csv = [HEADER, BUY_ROW, SELL_ROW_GAIN].join("\n");
    const mockHttp = vi.fn().mockResolvedValue({ status: 503, data: "" });

    const result = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttp,
    );
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.code).toBe("NETWORK_ERROR");
    expect(typeof body.message).toBe("string");
  });

  it("CalculationError → same shape as calculate_gains (CALCULATION_ERROR with isin/date)", async () => {
    // A SELL with no preceding BUY -> no open lots for that ISIN/date.
    const sellOnlyRow =
      "15-03-2024,14:20,Apple Inc,US0378331005,XNAS,XNAS,-10,180.00,1800.00,EUR,1800.00,EUR,1,-2.00,EUR,1798.00,EUR,abc-456";
    const csv = [HEADER, sellOnlyRow].join("\n");
    const mockHttp = stockMockHttp();

    const result = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttp,
    );
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.code).toBe("CALCULATION_ERROR");
    expect(body.isin).toBe(STOCK_ISIN);
    expect(body.date).toBe("2024-03-15");
    expect(typeof body.message).toBe("string");
  });
});

describe("TC-244: calculate_from_csv — extra forwarded; multi-batch progress fires", () => {
  // 25 distinct ISINs -> ceil(25/10) = 3 OpenFIGI batches (Classifier's
  // batch size, src/classifier/index.ts:454-457), forcing multi-batch
  // progress regardless of how many end up resolved vs. not.
  const ISINS = Array.from(
    { length: 25 },
    (_, i) => `XX${String(i).padStart(10, "0")}`,
  );

  function buildCsv(): string {
    const rows = ISINS.map(
      (isin, i) =>
        `14-01-2024,09:0${i % 10},Test Stock ${i},${isin},XNAS,XNAS,10,100.00,-1000.00,EUR,-1000.00,EUR,1,0.00,EUR,-1000.00,EUR,ord-${i}`,
    );
    return [HEADER, ...rows].join("\n");
  }

  function makeMockHttp() {
    return vi.fn().mockImplementation(async (_url: string, body: string) => {
      const items = JSON.parse(body) as unknown[];
      return jsonResult(
        200,
        items.map(() => ({ data: [{ securityType: "Common Stock" }] })),
      );
    });
  }

  it("forwards extra into the inner classify step: same notifications/progress sequence a direct classify_instruments call would send", async () => {
    const csv = buildCsv();

    vi.useFakeTimers();
    try {
      const mockHttp = makeMockHttp();
      const sendNotification = vi
        .fn<(n: ProgressNotification) => Promise<void>>()
        .mockResolvedValue(undefined);

      const promise = handleCalculateFromCsv(
        { csv, method: "LIFO" },
        { _meta: { progressToken: "abc" }, sendNotification },
        mockHttp,
      );

      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(6000);

      const result = await promise;
      expect(result.isError).toBeUndefined();

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
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends 0 notifications when extra has no progressToken, and the result is identical either way", async () => {
    const csv = buildCsv();

    vi.useFakeTimers();
    try {
      // Pin the fake wall clock to the same instant before each call so the
      // two reports' `generatedAt` timestamps match too — otherwise the two
      // JSON strings would legitimately differ only by the time the
      // batch-progress delay advanced fake time between calls, which isn't
      // what this test is checking.
      const FROZEN = new Date("2024-01-01T00:00:00Z");

      vi.setSystemTime(FROZEN);
      const mockHttpWithToken = makeMockHttp();
      const sendNotification = vi
        .fn<(n: ProgressNotification) => Promise<void>>()
        .mockResolvedValue(undefined);
      const withTokenPromise = handleCalculateFromCsv(
        { csv, method: "LIFO" },
        { _meta: { progressToken: "abc" }, sendNotification },
        mockHttpWithToken,
      );
      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(6000);
      const resultWithToken = await withTokenPromise;

      vi.setSystemTime(FROZEN);
      const mockHttpNoToken = makeMockHttp();
      const withoutTokenPromise = handleCalculateFromCsv(
        { csv, method: "LIFO" },
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
});
