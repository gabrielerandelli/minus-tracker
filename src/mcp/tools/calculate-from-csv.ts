import { DEGIROParser } from "../../parser/index.js";
import { Classifier } from "../../classifier/index.js";
import { Calculator } from "../../calculator/index.js";
import {
  ParseError,
  ClassificationError,
  CalculationError,
} from "../../errors.js";
import type { CalculateFromCsvInput, ClassificationMap } from "../../types.js";
import {
  toParseErrorResult,
  toClassificationErrorResult,
  toCalculationErrorResult,
} from "../errors.js";
import type {
  ClassifyInstrumentsExtra,
} from "./classify-instruments.js";

/**
 * Minimal HTTP-POST seam mirroring `Classifier.classify()`'s own `_httpPost`
 * test-injection parameter — see the identical seam in
 * `src/mcp/tools/classify-instruments.ts`.
 */
type HttpPost = (
  url: string,
  body: string,
  timeoutMs: number,
) => Promise<{ status: number; data: string }>;

/**
 * Same reconstruction `classify_instruments` uses (see
 * `buildUnresolvedWarnings` in `src/mcp/tools/classify-instruments.ts`):
 * `classify()`'s stateless mode doesn't return its internal per-ISIN
 * warnings, only the merged `ClassificationMap`, so an unresolved entry is
 * identified by the same `confirmedByUser: false, source: "user"` marker
 * `Classifier` itself uses for that case.
 */
function buildUnresolvedIsins(classification: ClassificationMap): string[] {
  const isins: string[] = [];
  for (const [isin, entry] of Object.entries(classification)) {
    if (!entry.confirmedByUser && entry.source === "user") isins.push(isin);
  }
  return isins;
}

function buildUnresolvedWarnings(classification: ClassificationMap): string[] {
  return buildUnresolvedIsins(classification).map(
    (isin) =>
      `Unrecognized type for ${isin}: unknown. Please classify manually.`,
  );
}

/**
 * MCP tool handler for `calculate_from_csv` (Part 19). A composite tool: a
 * direct in-process composition of the three existing granular handlers —
 * `handleParseTransactions` (`DEGIROParser`) -> `handleClassifyInstruments`
 * (`Classifier.classify()`'s stateless mode) -> `handleCalculateGains`
 * (`Calculator`) — with no new tax logic, parsing logic, or
 * error-handling logic of its own.
 *
 * Exists to close the LLM data round-trip risk described in Part 19: an
 * LLM-orchestrated caller only ever has to relay the original CSV text
 * across a tool-call boundary, never a parsed `Transaction[]` array it would
 * otherwise have to reproduce verbatim in its own output.
 *
 * Best-effort semantics (an unresolved ISIN defaulting to Bucket B) and the
 * `incomeRows` wiring are inherited for free by composing the same handlers
 * `parse_transactions`/`classify_instruments`/`calculate_gains` already use
 * — no special-casing is added here on top of them.
 *
 * `extra` (the `progressToken`/`sendNotification` slice of the MCP SDK's
 * `RequestHandlerExtra`) is forwarded UNCHANGED into the inner classify
 * step, exactly like a direct `classify_instruments` call would receive it
 * (`src/mcp/tools/classify-instruments.ts`). Without this explicit
 * forwarding, multi-batch OpenFIGI progress notifications would never fire
 * for `calculate_from_csv`, regardless of transport/client support — a
 * strictly worse failure than a client simply not displaying them.
 *
 * Error shapes are identical to the three composed tools by construction:
 * this handler reuses the exact same `toParseErrorResult`/
 * `toClassificationErrorResult`/`toCalculationErrorResult` mapping functions
 * those tools use, rather than any new mapping of its own.
 *
 * `_httpPost` is an optional last parameter purely for test injection,
 * mirroring `classify_instruments`'s own seam — left `undefined` in the real
 * server.ts wiring, which falls through to `Classifier`'s real `httpsPost`.
 */
export async function handleCalculateFromCsv(
  args: CalculateFromCsvInput,
  extra?: ClassifyInstrumentsExtra,
  _httpPost?: HttpPost,
) {
  const parser = new DEGIROParser();
  let transactions;
  try {
    transactions = parser.parse(args.csv);
  } catch (err) {
    if (err instanceof ParseError) return toParseErrorResult(err);
    throw err;
  }
  const parseWarnings = parser.warnings;
  const incomeRows = parser.incomeRows;

  const progressToken = extra?._meta?.progressToken;
  const sendNotification = extra?.sendNotification;
  const onBatchProgress =
    progressToken !== undefined && sendNotification
      ? (done: number, total: number) => {
          void sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress: done, total },
          });
        }
      : undefined;

  const classifier = new Classifier();
  let classification: ClassificationMap;
  try {
    classification = await classifier.classify(
      transactions,
      undefined,
      {
        overrides: args.overrides,
        offline: args.offline,
        onBatchProgress,
      },
      _httpPost,
    );
  } catch (err) {
    if (err instanceof ClassificationError) return toClassificationErrorResult(err);
    throw err;
  }

  let report;
  try {
    report = new Calculator(transactions, parseWarnings, {
      classification,
      carryForward: args.carryForward,
      incomeRows,
    }).calculateGains(args.method);
  } catch (err) {
    if (err instanceof CalculationError) return toCalculationErrorResult(err);
    throw err;
  }

  // report.warnings already carries parseWarnings (Calculator seeds its own
  // warnings list with them, see src/calculator/index.ts) plus any
  // calculator-level warnings (e.g. its own Bucket-B-default notice) — only
  // the classify-layer "unrecognized type" warnings still need merging in,
  // the same way classify_instruments reconstructs them for its own callers.
  const warnings = [...report.warnings, ...buildUnresolvedWarnings(classification)];
  const unresolvedIsins = buildUnresolvedIsins(classification);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ report, warnings, unresolvedIsins }),
      },
    ],
  };
}
