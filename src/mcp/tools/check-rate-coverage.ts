import { getActiveSnapshot, getRateCoverage } from "../../rates/index.js";
import type { CheckRateCoverageInput } from "../../types.js";

/**
 * MCP tool handler for `check_rate_coverage` -- the read-only equivalent of
 * `rates --check` (Part 19). Wraps the shared `getRateCoverage()` scan
 * (`src/rates/index.ts`, also used by `rates --check` itself, Task 64/TC-235)
 * against whichever snapshot (bundled + merged user snapshot) is active at
 * call time.
 *
 * Never touches the network and never writes to disk -- unlike
 * `rates --update`, which is deliberately not exposed as a tool (Part 19) --
 * and raises no errors of its own: an unrecognized or absent currency is
 * simply omitted from the result by `getRateCoverage()`.
 */
export async function handleCheckRateCoverage(args: CheckRateCoverageInput) {
  const snapshot = getActiveSnapshot();
  const { coverage, gaps } = getRateCoverage(snapshot, args?.currencies);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ coverage, gaps }),
      },
    ],
  };
}
