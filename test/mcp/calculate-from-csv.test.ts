import { describe, it, expect, vi } from "vitest";
import { DEGIROParser } from "../../src/parser/index.js";
import { handleParseTransactions } from "../../src/mcp/tools/parse-transactions.js";
import { handleClassifyInstruments } from "../../src/mcp/tools/classify-instruments.js";
import { handleCalculateGains } from "../../src/mcp/tools/calculate-gains.js";
import { handleCalculateFromCsv } from "../../src/mcp/tools/calculate-from-csv.js";

/**
 * Category: MCP Extensions (v0.13.0, Task 66).
 *
 * Covers TC-243 and TC-244 from docs/test_plan.md. `calculate_from_csv`
 * itself (Task 65's core composition — TC-236 through TC-242) is out of
 * this task's scope; these tests only exercise the Task 66 surface added
 * on top of it: error-shape parity with the granular tools it composes,
 * and `extra` (progressToken/sendNotification) forwarding into the
 * internal `classify_instruments` call.
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

function jsonResult(status: number, data: unknown) {
  return { status, data: JSON.stringify(data) };
}

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
    expect(composed.content[0]!.text).toEqual(direct.content[0]!.text);

    const body = JSON.parse(composed.content[0]!.text);
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
    expect(composed.content[0]!.text).toEqual(direct.content[0]!.text);

    const body = JSON.parse(composed.content[0]!.text);
    expect(body.code).toBe("MISSING_COLUMN");
    expect(body.columnName).toBe("ISIN");
  });

  it("ClassificationError (NETWORK_ERROR): identical isError payload to a direct classify_instruments call", async () => {
    const BUY_ROW =
      "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";
    const csv = [HEADER, BUY_ROW].join("\n");
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
    expect(composed.content[0]!.text).toEqual(direct.content[0]!.text);

    const body = JSON.parse(composed.content[0]!.text);
    expect(body.code).toBe("NETWORK_ERROR");
  });

  it("CalculationError (NO_OPEN_LOTS via CALCULATION_ERROR): identical isError payload to a direct calculate_gains call", async () => {
    const SELL_ROW =
      "03-06-2024,14:20,Apple Inc,US0378331005,XNAS,XNAS,-10,180.00,1800.00,EUR,1800.00,EUR,1,-2.00,EUR,1798.00,EUR,abc-456";
    const csv = [HEADER, SELL_ROW].join("\n");
    const transactions = new DEGIROParser().parse(csv);

    const mockHttp = vi
      .fn()
      .mockResolvedValue(
        jsonResult(200, [{ data: [{ securityType: "Common Stock" }] }]),
      );

    // No classification passed directly: the error is thrown during lot
    // matching, before two-bucket routing ever consults the classification
    // map, so a direct calculate_gains call with no classification produces
    // the exact same CalculationError as the composed pipeline (which does
    // classify first, via `offline: true` so this test stays network-free).
    const direct = await handleCalculateGains({ transactions, method: "LIFO" });
    const composed = await handleCalculateFromCsv(
      { csv, method: "LIFO", offline: true },
      undefined,
      mockHttp,
    );

    expect(direct.isError).toBe(true);
    expect(composed.isError).toBe(true);
    expect(composed.content[0]!.text).toEqual(direct.content[0]!.text);

    const body = JSON.parse(composed.content[0]!.text);
    expect(body.code).toBe("CALCULATION_ERROR");
    expect(body.isin).toBe("US0378331005");
    expect(body.date).toBe("2024-06-03");
  });
});

describe("TC-244: calculate_from_csv — extra forwarded; multi-batch progress fires", () => {
  // > Classifier's batch size of 10 (src/classifier/index.ts) to force a
  // multi-batch OpenFIGI run, mirroring TC-112's classify_instruments setup.
  const ISINS = Array.from(
    { length: 25 },
    (_, i) => `XX${String(i).padStart(10, "0")}`,
  );
  const rows = ISINS.map(
    (isin, i) =>
      `14-01-2024,09:05,Test Stock ${i},${isin},XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-${i}`,
  );
  const csv = [HEADER, ...rows].join("\n");

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
      const transactions = new DEGIROParser().parse(csv);

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
        { csv, method: "LIFO" },
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
        { csv, method: "LIFO" },
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
        { csv, method: "LIFO" },
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
