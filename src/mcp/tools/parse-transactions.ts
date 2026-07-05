import { DEGIROParser } from "../../parser/index.js";
import { ParseError } from "../../errors.js";
import type { ParseTransactionsInput } from "../../types.js";
import { toParseErrorResult } from "../errors.js";

/**
 * MCP tool handler for `parse_transactions`. Wraps `DEGIROParser.parse()` and
 * returns its transactions, warnings, and incomeRows in a single tool result.
 */
export async function handleParseTransactions(args: ParseTransactionsInput) {
  const parser = new DEGIROParser();
  try {
    const transactions = parser.parse(args.csv);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            transactions,
            warnings: parser.warnings,
            incomeRows: parser.incomeRows,
          }),
        },
      ],
    };
  } catch (err) {
    if (err instanceof ParseError) return toParseErrorResult(err);
    throw err;
  }
}
