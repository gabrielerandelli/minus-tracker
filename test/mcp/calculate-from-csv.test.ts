import { describe, it, expect, vi } from "vitest";
import { DEGIROParser } from "../../src/parser/index.js";
import { handleParseTransactions } from "../../src/mcp/tools/parse-transactions.js";
import { handleClassifyInstruments } from "../../src/mcp/tools/classify-instruments.js";
import { handleCalculateGains } from "../../src/mcp/tools/calculate-gains.js";
import { handleCalculateFromCsv } from "../../src/mcp/tools/calculate-from-csv.js";

/**
 * Category 21 — MCP Server: `calculate_from_csv` composite tool (v0.13.0)
 *
 * TC-236 through TC-242 (Task 65's core composition, below) call
 * `handleCalculateFromCsv` directly with `(args, extra, _httpPost)` — every
 * one passes `undefined` for `extra` since none of them need progress
 * notifications, and every one injects a fake OpenFIGI `_httpPost` (or uses
 * `offline: true`) so they stay deterministic and network-free, per Part
 * 19's Testing Approach.
 *
 * TC-243/TC-244 (Task 66, at the bottom of this file) cover `extra`
 * forwarding and error-shape parity with the granular tools this handler
 * composes; TC-245 (protocol-level registration) lives in
 * `test/mcp/protocol.test.ts`.
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

const ETF_ISIN = "IE00B4L5Y983";
const STOCK_ISIN = "US0378331005";

function buyRow(isin: string, date: string, qty: number, price: number) {
  const local = -(qty * price);
  return `${date},09:05,Test Product,${isin},XNAS,XNAS,${qty},${price.toFixed(2)},${local.toFixed(2)},EUR,${local.toFixed(2)},EUR,1,-2.00,EUR,${(local - 2).toFixed(2)},EUR,order-buy`;
}

function sellRow(isin: string, date: string, qty: number, price: number) {
  const local = qty * price;
  return `${date},14:20,Test Product,${isin},XNAS,XNAS,${-qty},${price.toFixed(2)},${local.toFixed(2)},EUR,${local.toFixed(2)},EUR,1,-2.00,EUR,${(local - 2).toFixed(2)},EUR,order-sell`;
}

function jsonResult(status: number, data: unknown) {
  return { status, data: JSON.stringify(data) };
}

/** Always resolves every ISIN as an OpenFIGI "ETF" (Bucket A, 26%). */
function mockHttpAlwaysEtf() {
  return vi.fn().mockImplementation(async (_url: string, body: string) => {
    const items = JSON.parse(body) as unknown[];
    return jsonResult(
      200,
      items.map(() => ({ data: [{ securityType: "ETF" }] })),
    );
  });
}

/** Always resolves every ISIN as an unrecognized OpenFIGI type ("REIT"). */
function mockHttpAlwaysUnknown() {
  return vi.fn().mockImplementation(async (_url: string, body: string) => {
    const items = JSON.parse(body) as unknown[];
    return jsonResult(
      200,
      items.map(() => ({ data: [{ securityType: "REIT" }] })),
    );
  });
}

// Every buy/sell fixture below is 10 units @100 (cost 1000 + 2 fees = 1002
// cost basis) against either 10 units @140 (proceeds 1400 - 2 fees = 1398,
// a 396 gain) or 10 units @70 (proceeds 700 - 2 fees = 698, a 304 loss).

describe("TC-236: calculate_from_csv — every ISIN resolves → full report, no unresolved", () => {
  it("returns a full report with bucketA populated and unresolvedIsins: []", async () => {
    const csv = [
      HEADER,
      buyRow(ETF_ISIN, "10-01-2024", 10, 100),
      sellRow(ETF_ISIN, "10-06-2024", 10, 140),
    ].join("\n");

    const result = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttpAlwaysEtf(),
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);

    expect(body.unresolvedIsins).toEqual([]);
    expect(body.report.bucketA).toEqual({
      groups: [
        {
          taxRate: 0.26,
          assetClasses: ["ETF"],
          plusvalenze: 396,
          imposta: 102.96,
        },
      ],
      totalImposta: 102.96,
    });
    expect(
      body.warnings.some((w: string) =>
        w.includes("Please classify manually"),
      ),
    ).toBe(false);
  });
});

describe("TC-237: calculate_from_csv — unresolved ISINs → Bucket B default + list", () => {
  it("still returns a full (non-omitted) report and populates unresolvedIsins", async () => {
    const csv = [
      HEADER,
      buyRow(STOCK_ISIN, "10-01-2024", 10, 100),
      sellRow(STOCK_ISIN, "10-06-2024", 10, 70),
    ].join("\n");

    const result = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttpAlwaysUnknown(),
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);

    expect(body.unresolvedIsins).toEqual([STOCK_ISIN]);
    expect(
      body.warnings.some(
        (w: string) =>
          w.includes(STOCK_ISIN) && w.includes("Please classify manually"),
      ),
    ).toBe(true);

    // Full report, not partial/omitted: Bucket B default with the real
    // computed loss, not an empty/placeholder result.
    expect(body.report.bucketB).toEqual({
      plusvalenze: 0,
      minusvalenze: 304,
      carryForwardApplied: 0,
      carryForwardRemaining: 304,
      carryForwardEntriesRemaining: [],
      netResult: -304,
    });
    expect(body.report.lots).toHaveLength(1);
  });
});

describe("TC-237b: calculate_from_csv — mixed portfolio, partial resolution", () => {
  it("only the truly-unresolved ISIN lands in unresolvedIsins; the resolved one still splits into bucketA", async () => {
    // Every TC-236/237 fixture above uses a single-ISIN CSV, which can't
    // distinguish "collectUnresolvedIsins scans the whole classification
    // map" from "only looks at the first/last entry". This regression guard
    // uses a two-ISIN CSV (one OpenFIGI-resolvable, one not) so
    // Object.entries(classification) is actually exercised across more than
    // one entry.
    const csv = [
      HEADER,
      buyRow(ETF_ISIN, "10-01-2024", 10, 100),
      sellRow(ETF_ISIN, "10-06-2024", 10, 140),
      buyRow(STOCK_ISIN, "10-01-2024", 10, 100),
      sellRow(STOCK_ISIN, "10-06-2024", 10, 70),
    ].join("\n");

    const mockHttp = vi
      .fn()
      .mockImplementation(async (_url: string, body: string) => {
        const items = JSON.parse(body) as { idValue: string }[];
        return jsonResult(
          200,
          items.map((item) => ({
            data: [
              { securityType: item.idValue === ETF_ISIN ? "ETF" : "REIT" },
            ],
          })),
        );
      });

    const result = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttp,
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);

    expect(body.unresolvedIsins).toEqual([STOCK_ISIN]);
    expect(body.report.bucketA.groups[0].plusvalenze).toBe(396);
    expect(body.report.bucketB.minusvalenze).toBe(304);
  });
});

describe("TC-238: calculate_from_csv — overrides correction retry resolves ISINs", () => {
  it("a retry with overrides for the unresolved ISIN clears it and re-routes the gain", async () => {
    const csv = [
      HEADER,
      buyRow(STOCK_ISIN, "10-01-2024", 10, 100),
      sellRow(STOCK_ISIN, "10-06-2024", 10, 140),
    ].join("\n");

    const first = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttpAlwaysUnknown(),
    );
    const firstBody = JSON.parse(first.content[0].text);
    expect(firstBody.unresolvedIsins).toEqual([STOCK_ISIN]);
    expect(firstBody.report.bucketA).toBeUndefined();
    expect(firstBody.report.bucketB.plusvalenze).toBe(396);

    // Correction retry: force the previously-unresolved ISIN to ETF. A
    // fresh mock proves the override itself resolves it, not a leftover
    // OpenFIGI response from the first call — the tool is stateless, so
    // every call re-runs the full pipeline from scratch.
    const mockHttpRetry = mockHttpAlwaysUnknown();
    const retry = await handleCalculateFromCsv(
      { csv, method: "LIFO", overrides: { [STOCK_ISIN]: "ETF" } },
      undefined,
      mockHttpRetry,
    );

    expect(retry.isError).toBeUndefined();
    const retryBody = JSON.parse(retry.content[0].text);
    expect(retryBody.unresolvedIsins).toEqual([]);
    expect(retryBody.report.bucketA).toEqual({
      groups: [
        {
          taxRate: 0.26,
          assetClasses: ["ETF"],
          plusvalenze: 396,
          imposta: 102.96,
        },
      ],
      totalImposta: 102.96,
    });
    // The overridden ISIN never needed an OpenFIGI lookup.
    expect(mockHttpRetry).not.toHaveBeenCalled();
  });
});

describe("TC-239: calculate_from_csv — offline: true skips OpenFIGI entirely", () => {
  it("makes zero network calls and still returns a full report with unresolvedIsins populated", async () => {
    const csv = [
      HEADER,
      buyRow(STOCK_ISIN, "10-01-2024", 10, 100),
      sellRow(STOCK_ISIN, "10-06-2024", 10, 70),
    ].join("\n");
    const mockHttp = vi.fn();

    const result = await handleCalculateFromCsv(
      { csv, method: "LIFO", offline: true },
      undefined,
      mockHttp,
    );

    expect(result.isError).toBeUndefined();
    expect(mockHttp).not.toHaveBeenCalled();

    const body = JSON.parse(result.content[0].text);
    expect(body.unresolvedIsins).toEqual([STOCK_ISIN]);
    expect(body.report.bucketB.netResult).toBe(-304);
  });
});

describe("TC-240: calculate_from_csv — carryForward forwarded to calculate_gains", () => {
  it("a supplied carryForward entry offsets this year's Bucket B gain", async () => {
    // A gain fixture: a prior-year carryForward loss can only offset a gain,
    // not this year's own loss (Calculator only applies it when this year's
    // running Bucket B result is positive — see src/calculator/index.ts).
    const csv = [
      HEADER,
      buyRow(STOCK_ISIN, "10-01-2024", 10, 100),
      sellRow(STOCK_ISIN, "10-06-2024", 10, 140),
    ].join("\n");

    const withoutCarryForward = await handleCalculateFromCsv(
      { csv, method: "LIFO", offline: true },
      undefined,
      vi.fn(),
    );
    const withoutBody = JSON.parse(withoutCarryForward.content[0].text);
    expect(withoutBody.report.bucketB.carryForwardApplied).toBe(0);
    expect(withoutBody.report.bucketB.netResult).toBe(396);

    const withCarryForward = await handleCalculateFromCsv(
      {
        csv,
        method: "LIFO",
        offline: true,
        carryForward: [{ year: 2023, amount: 100 }],
      },
      undefined,
      vi.fn(),
    );
    const withBody = JSON.parse(withCarryForward.content[0].text);

    expect(withBody.report.bucketB.plusvalenze).toBe(396);
    expect(withBody.report.bucketB.carryForwardApplied).toBe(100);
    expect(withBody.report.bucketB.netResult).toBe(296);
    expect(withBody.report.bucketB.carryForwardEntriesRemaining).toEqual([]);
  });
});

describe("TC-241: calculate_from_csv — carryForward omitted on retry loses effect", () => {
  it("a correction retry that forgets carryForward silently drops its effect (regression guard)", async () => {
    const csv = [
      HEADER,
      buyRow(STOCK_ISIN, "10-01-2024", 10, 100),
      sellRow(STOCK_ISIN, "10-06-2024", 10, 140),
    ].join("\n");

    const original = await handleCalculateFromCsv(
      {
        csv,
        method: "LIFO",
        offline: true,
        carryForward: [{ year: 2023, amount: 100 }],
      },
      undefined,
      vi.fn(),
    );
    const originalBody = JSON.parse(original.content[0].text);
    expect(originalBody.unresolvedIsins).toEqual([STOCK_ISIN]);
    expect(originalBody.report.bucketB.carryForwardApplied).toBe(100);
    expect(originalBody.report.bucketB.netResult).toBe(296);

    // Correction retry with overrides (to a still-Bucket-B asset class, so
    // the comparison below isolates carryForward's effect) but *without*
    // re-supplying carryForward — this is documented, expected
    // statelessness, not a bug this handler should work around.
    const retry = await handleCalculateFromCsv(
      {
        csv,
        method: "LIFO",
        offline: true,
        overrides: { [STOCK_ISIN]: "Stock" },
      },
      undefined,
      vi.fn(),
    );
    const retryBody = JSON.parse(retry.content[0].text);

    expect(retryBody.unresolvedIsins).toEqual([]);
    expect(retryBody.report.bucketB.plusvalenze).toBe(396);
    // carryForward's effect is gone: nothing applied, so netResult is the
    // full 396 gain instead of the 296 the original call produced.
    expect(retryBody.report.bucketB.carryForwardApplied).toBe(0);
    expect(retryBody.report.bucketB.netResult).toBe(396);
  });
});

describe("TC-242: calculate_from_csv — incomeRows wired internally into calculate_gains", () => {
  it("dividend income parsed from the csv reaches report.dichiarazione.quadroRM without being passed explicitly", async () => {
    const dividendRow =
      "03-06-2024,00:00,DIVIDEND Test Product,US0378331005,,,0,,35.00,EUR,35.00,EUR,1,0.00,EUR,35.00,EUR,";
    const csv = [
      HEADER,
      buyRow(STOCK_ISIN, "10-01-2024", 10, 100),
      sellRow(STOCK_ISIN, "10-06-2024", 10, 140),
      dividendRow,
    ].join("\n");

    const result = await handleCalculateFromCsv(
      { csv, method: "LIFO", offline: true },
      undefined,
      vi.fn(),
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);

    expect(body.report.dichiarazione).toBeDefined();
    expect(body.report.dichiarazione.quadroRM.dividendiEsteri).toEqual([
      {
        isin: STOCK_ISIN,
        prodotto: "DIVIDEND Test Product",
        lordo: 35,
        rittenutaEstera: 0,
      },
    ]);
    expect(body.report.dichiarazione.quadroRM.cedole).toEqual([]);
  });
});

/**
 * Task 66. Covers TC-243 and TC-244 from docs/test_plan.md. `extra`
 * forwarding and error-shape parity are the only Task 66 surface added on
 * top of Task 65's core composition above — everything else in this file
 * is unchanged apart from `undefined` now needing to be threaded through as
 * the new `extra` parameter.
 */

describe("TC-243: calculate_from_csv — error shapes match the granular tools it composes", () => {
  it("ParseError (INVALID_CSV): identical isError payload to a direct parse_transactions call", async () => {
    const garbage = "\x00\x00binary garbage\x00\x00";

    const direct = await handleParseTransactions({ csv: garbage });
    const composed = await handleCalculateFromCsv({
      csv: garbage,
      method: "LIFO",
    });

    expect(direct.isError).toBe(true);
    expect(composed.isError).toBe(true);
    expect(composed.content[0].text).toEqual(direct.content[0].text);

    const body = JSON.parse(composed.content[0].text);
    expect(body.code).toBe("INVALID_CSV");
  });

  it("ParseError (MISSING_COLUMN): identical isError payload to a direct parse_transactions call", async () => {
    const headerNoISIN =
      "Date,Time,Product,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
    const row =
      "14-01-2024,09:05,Apple Inc,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";
    const csv = [headerNoISIN, row].join("\n");

    const direct = await handleParseTransactions({ csv });
    const composed = await handleCalculateFromCsv({ csv, method: "LIFO" });

    expect(direct.isError).toBe(true);
    expect(composed.isError).toBe(true);
    expect(composed.content[0].text).toEqual(direct.content[0].text);

    const body = JSON.parse(composed.content[0].text);
    expect(body.code).toBe("MISSING_COLUMN");
    expect(body.columnName).toBe("ISIN");
  });

  it("ClassificationError (NETWORK_ERROR): identical isError payload to a direct classify_instruments call", async () => {
    const buyRowRaw =
      "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";
    const csv = [HEADER, buyRowRaw].join("\n");
    const transactions = new DEGIROParser().parse(csv);

    const mockHttp503 = vi.fn().mockResolvedValue({ status: 503, data: "" });

    const direct = await handleClassifyInstruments(
      { transactions },
      undefined,
      mockHttp503,
    );
    const composed = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      undefined,
      mockHttp503,
    );

    expect(direct.isError).toBe(true);
    expect(composed.isError).toBe(true);
    expect(composed.content[0].text).toEqual(direct.content[0].text);

    const body = JSON.parse(composed.content[0].text);
    expect(body.code).toBe("NETWORK_ERROR");
  });

  it("CalculationError (NO_OPEN_LOTS via CALCULATION_ERROR): identical isError payload to a direct calculate_gains call", async () => {
    const sellRowRaw =
      "03-06-2024,14:20,Apple Inc,US0378331005,XNAS,XNAS,-10,180.00,1800.00,EUR,1800.00,EUR,1,-2.00,EUR,1798.00,EUR,abc-456";
    const csv = [HEADER, sellRowRaw].join("\n");
    const transactions = new DEGIROParser().parse(csv);

    const mockHttp = vi
      .fn()
      .mockResolvedValue(
        jsonResult(200, [{ data: [{ securityType: "Common Stock" }] }]),
      );

    // The SELL-only fixture has no open BUY lot, so the CalculationError is
    // thrown during lot matching itself — before two-bucket routing ever
    // consults the classification map — so a direct calculate_gains call
    // with no classification produces the exact same error as the composed
    // pipeline (which does classify first, via `offline: true` so this test
    // stays network-free regardless).
    const direct = await handleCalculateGains({ transactions, method: "LIFO" });
    const composed = await handleCalculateFromCsv(
      { csv, method: "LIFO", offline: true },
      undefined,
      mockHttp,
    );

    expect(direct.isError).toBe(true);
    expect(composed.isError).toBe(true);
    expect(composed.content[0].text).toEqual(direct.content[0].text);

    const body = JSON.parse(composed.content[0].text);
    expect(body.code).toBe("CALCULATION_ERROR");
    expect(body.isin).toBe("US0378331005");
    expect(body.date).toBe("2024-06-03");
  });
});

describe("TC-244: calculate_from_csv — extra forwarded; multi-batch progress fires", () => {
  // > Classifier's batch size of 10 (src/classifier/index.ts) to force a
  // multi-batch OpenFIGI run, mirroring TC-112's classify_instruments setup.
  const manyIsins = Array.from(
    { length: 25 },
    (_, i) => `XX${String(i).padStart(10, "0")}`,
  );
  const manyRows = manyIsins.map(
    (isin, i) =>
      `14-01-2024,09:05,Test Stock ${i},${isin},XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-${i}`,
  );
  const manyIsinCsv = [HEADER, ...manyRows].join("\n");

  function makeMockHttp() {
    return vi.fn().mockImplementation(async (_url: string, body: string) => {
      const items = JSON.parse(body) as unknown[];
      return jsonResult(
        200,
        items.map(() => ({ data: [{ securityType: "Common Stock" }] })),
      );
    });
  }

  it("with a progressToken, sends the same notifications/progress sequence a direct classify_instruments call would", async () => {
    vi.useFakeTimers();
    try {
      const transactions = new DEGIROParser().parse(manyIsinCsv);

      const directHttp = makeMockHttp();
      const directSend = vi.fn().mockResolvedValue(undefined);
      const directPromise = handleClassifyInstruments(
        { transactions },
        { _meta: { progressToken: "tok-1" }, sendNotification: directSend },
        directHttp,
      );
      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(6000);
      await directPromise;

      const composedHttp = makeMockHttp();
      const composedSend = vi.fn().mockResolvedValue(undefined);
      const composedPromise = handleCalculateFromCsv(
        { csv: manyIsinCsv, method: "LIFO" },
        { _meta: { progressToken: "tok-1" }, sendNotification: composedSend },
        composedHttp,
      );
      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(6000);
      const composedResult = await composedPromise;

      expect(composedResult.isError).toBeUndefined();
      expect(composedSend).toHaveBeenCalledTimes(3);
      expect(composedSend.mock.calls).toEqual(directSend.mock.calls);
      expect(composedSend).toHaveBeenNthCalledWith(1, {
        method: "notifications/progress",
        params: { progressToken: "tok-1", progress: 1, total: 3 },
      });
      expect(composedSend).toHaveBeenNthCalledWith(3, {
        method: "notifications/progress",
        params: { progressToken: "tok-1", progress: 3, total: 3 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("without a progressToken, sends zero notifications, same as classify_instruments", async () => {
    vi.useFakeTimers();
    try {
      const composedHttp = makeMockHttp();
      const sendNotification = vi.fn().mockResolvedValue(undefined);
      const promise = handleCalculateFromCsv(
        { csv: manyIsinCsv, method: "LIFO" },
        { sendNotification },
        composedHttp,
      );
      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(6000);
      const result = await promise;

      expect(result.isError).toBeUndefined();
      expect(sendNotification).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("without any extra argument at all, still completes (extra is fully optional)", async () => {
    vi.useFakeTimers();
    try {
      const composedHttp = makeMockHttp();
      const promise = handleCalculateFromCsv(
        { csv: manyIsinCsv, method: "LIFO" },
        undefined,
        composedHttp,
      );
      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(6000);
      const result = await promise;

      expect(result.isError).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
