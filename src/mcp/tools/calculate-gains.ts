import { Calculator } from "../../calculator/index.js";
import { CalculationError } from "../../errors.js";
import type { CalculateGainsInput } from "../../types.js";
import { toCalculationErrorResult } from "../errors.js";

/**
 * MCP tool handler for `calculate_gains`. Wraps `Calculator.calculateGains()`
 * and returns the resulting `GainsReport` as a single tool result. Purely an
 * adapter — no calculation logic lives here.
 *
 * Note: `report.dichiarazione?.exportTo` is a function property; `JSON.stringify`
 * drops it automatically, so no manual stripping is needed.
 */
export async function handleCalculateGains(args: CalculateGainsInput) {
  try {
    const report = new Calculator(args.transactions, args.parseWarnings ?? [], {
      classification: args.classification,
      carryForward: args.carryForward,
      incomeRows: args.incomeRows,
    }).calculateGains(args.method);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(report),
        },
      ],
    };
  } catch (err) {
    if (err instanceof CalculationError) return toCalculationErrorResult(err);
    throw err;
  }
}
