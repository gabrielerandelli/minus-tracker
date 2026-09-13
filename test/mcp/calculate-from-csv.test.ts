import { describe, it, expect, vi } from "vitest";
import { handleCalculateFromCsv } from "../../src/mcp/tools/calculate-from-csv.js";

/**
 * Category 21 — MCP Server: `calculate_from_csv` composite tool (v0.13.0)
 *
 * Covers TC-236 through TC-242 from docs/test_plan.md (Part 19). Unit-level:
 * calls `handleCalculateFromCsv` directly, no MCP transport/client. Every
 * test injects a fake OpenFIGI `_httpPost` (or uses `offline: true`) so
 * these stay deterministic and network-free, per Part 19's Testing Approach.
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
    return jsonResult(200, items.map(() => ({ data: [{ securityType: "REIT" }] })));
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
      body.warnings.some((w: string) => w.includes("Please classify manually")),
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
      mockHttpAlwaysUnknown(),
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);

    expect(body.unresolvedIsins).toEqual([STOCK_ISIN]);
    expect(
      body.warnings.some(
        (w: string) => w.includes(STOCK_ISIN) && w.includes("Please classify manually"),
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

describe("TC-238: calculate_from_csv — overrides correction retry resolves ISINs", () => {
  it("a retry with overrides for the unresolved ISIN clears it and re-routes the gain", async () => {
    const csv = [
      HEADER,
      buyRow(STOCK_ISIN, "10-01-2024", 10, 100),
      sellRow(STOCK_ISIN, "10-06-2024", 10, 140),
    ].join("\n");

    const first = await handleCalculateFromCsv(
      { csv, method: "LIFO" },
      mockHttpAlwaysUnknown(),
    );
    const firstBody = JSON.parse(first.content[0].text);
    expect(firstBody.unresolvedIsins).toEqual([STOCK_ISIN]);
    expect(firstBody.report.bucketA).toBeUndefined();
    expect(firstBody.report.bucketB.plusvalenze).toBe(396);

    // Correction retry: force the previously-unresolved ISIN to ETF.
    const mockHttpRetry = mockHttpAlwaysUnknown();
    const retry = await handleCalculateFromCsv(
      { csv, method: "LIFO", overrides: { [STOCK_ISIN]: "ETF" } },
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
      { csv, method: "LIFO", offline: true, overrides: { [STOCK_ISIN]: "Stock" } },
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
