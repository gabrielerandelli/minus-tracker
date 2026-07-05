import {
  ParseError,
  ClassificationError,
  CalculationError,
} from "../errors.js";

/**
 * Shared MCP tool-result shape for error responses. Each tool's error type
 * (ParseError, ClassificationError, CalculationError) is mapped to the same
 * `{ isError: true, content: [{ type: "text", text: JSON-string }] }` shape
 * expected by the SDK's `CallToolResult` type.
 */
function toErrorResult(fields: Record<string, unknown>) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(fields) }],
  };
}

export function toParseErrorResult(err: ParseError) {
  return toErrorResult({
    code: err.code,
    columnName: err.columnName,
    message: err.message,
  });
}

export function toClassificationErrorResult(err: ClassificationError) {
  return toErrorResult({
    code: err.code,
    message: err.message,
  });
}

export function toCalculationErrorResult(err: CalculationError) {
  return toErrorResult({
    code: "CALCULATION_ERROR",
    isin: err.isin,
    date: err.date,
    message: err.message,
  });
}
