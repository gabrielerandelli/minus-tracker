import { getActiveSnapshot, getCurrencyCoverage } from "../../rates/index.js";
import type { CheckRateCoverageInput } from "../../types.js";

/**
 * MCP tool handler for `check_rate_coverage` (Part 19). Read-only equivalent
 * of `rates --check` — lets a caller confirm ECB FX date coverage before
 * running `calculate_gains`/`calculate_from_csv`, without ever writing to
 * disk or touching the network (`getActiveSnapshot()` only reads the bundled
 * snapshot plus any locally-cached user snapshot; unlike `rates --update`,
 * this tool never fetches from ECB, which is exactly why it's the one
 * exposed as an MCP tool — see docs/prd/19-mcp-server-extensions.md).
 *
 * Shares its per-currency scan with the CLI's `rates --check`
 * (`src/rates/index.ts`'s `getCurrencyCoverage()`) so the two can never
 * silently drift apart on what counts as "covered".
 *
 * No errors are thrown here (per the Part 19 contract) beyond whatever
 * `getActiveSnapshot()` itself throws when no snapshot is available at all —
 * an environment-setup problem, not a `calculate_from_csv`/`calculate_gains`-
 * style domain error with its own error shape.
 */
export async function handleCheckRateCoverage(args: CheckRateCoverageInput) {
  const snapshot = getActiveSnapshot();
  const perCurrency = getCurrencyCoverage(snapshot, args.currencies);

  const coverage: Record<string, { from: string; to: string }> = {};
  const gaps: Record<string, string[]> = {};
  for (const [ccy, entry] of Object.entries(perCurrency)) {
    coverage[ccy] = { from: entry.from, to: entry.to };
    gaps[ccy] = entry.missing;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ coverage, gaps }),
      },
    ],
  };
}
