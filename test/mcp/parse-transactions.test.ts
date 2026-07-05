import { describe, it, expect } from "vitest";
import { DEGIROParser } from "../../src/parser/index.js";
import { handleParseTransactions } from "../../src/mcp/tools/parse-transactions.js";

/**
 * Category 20 — MCP Server: Tools (v0.8.0)
 *
 * Covers TC-105, TC-106, TC-107 from docs/test_plan/15-mcp-server-tools.md.
 * Unit-level: calls `handleParseTransactions` directly, no MCP transport/client.
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

describe("TC-105: parse_transactions — valid CSV → transactions + warnings + incomeRows", () => {
  const BUY_ROW =
    "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";
  const SELL_ROW =
    "15-03-2024,14:20,Apple Inc,US0378331005,XNAS,XNAS,-10,180.00,1800.00,EUR,1800.00,EUR,1,-2.00,EUR,1798.00,EUR,abc-456";
  const DIVIDEND_ROW =
    "03-06-2024,00:00,DIVIDEND Apple Inc,US0378331005,,,0,,35.00,EUR,35.00,EUR,1,0.00,EUR,35.00,EUR,";

  const csv = [HEADER, BUY_ROW, SELL_ROW, DIVIDEND_ROW].join("\n");

  it("Step 1: resolves without isError", async () => {
    const result = await handleParseTransactions({ csv });
    expect((result as { isError?: boolean }).isError).toBeUndefined();
  });

  it("Steps 2-4: transactions, warnings, incomeRows match a direct DEGIROParser.parse() call", async () => {
    const parser = new DEGIROParser();
    const expectedTransactions = parser.parse(csv);
    const expectedWarnings = parser.warnings;
    const expectedIncomeRows = parser.incomeRows;

    const result = await handleParseTransactions({ csv });
    const body = JSON.parse(result.content[0].text as string);

    expect(body.transactions).toEqual(expectedTransactions);
    expect(body.warnings).toEqual(expectedWarnings);
    expect(body.incomeRows).toEqual(expectedIncomeRows);
    expect(body.incomeRows).toHaveLength(1);
    expect(body.incomeRows[0].incomeType).toBe("dividend");
  });
});

describe("TC-106: parse_transactions — invalid CSV → INVALID_CSV", () => {
  it("returns isError: true with code INVALID_CSV", async () => {
    const garbage = "\x00\x00binary garbage\x00\x00";
    const result = await handleParseTransactions({ csv: garbage });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.code).toBe("INVALID_CSV");
    expect(typeof body.message).toBe("string");
  });
});

describe("TC-107: parse_transactions — missing ISIN column → MISSING_COLUMN", () => {
  it("returns isError: true with code MISSING_COLUMN and columnName ISIN", async () => {
    const headerNoISIN =
      "Date,Time,Product,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
    const row =
      "14-01-2024,09:05,Apple Inc,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";
    const csv = [headerNoISIN, row].join("\n");

    const result = await handleParseTransactions({ csv });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text as string);
    expect(body.code).toBe("MISSING_COLUMN");
    expect(body.columnName).toBe("ISIN");
    expect(typeof body.message).toBe("string");
  });
});
