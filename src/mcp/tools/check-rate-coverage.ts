import { getActiveSnapshot, getRateCoverage } from "../../rates/index.js";

/**
 * Input shape for the `check_rate_coverage` tool (Part 19). Declared locally
 * rather than in `src/types.ts` -- this tool's schema wiring (build-time JSON
 * Schema generation + `server.ts` registration) is separate follow-up work
 * (Task 66); this task only needs the handler and its own input type.
 *
 * `currencies` mirrors the bundled-currency union `getActiveSnapshot()` can
 * ever populate (`src/rates/index.ts`, Part 4) -- omit it to scan every
 * bundled currency.
 */
export interface CheckRateCoverageInput {
  currencies?: ("USD" | "GBP" | "CHF")[];
}

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
