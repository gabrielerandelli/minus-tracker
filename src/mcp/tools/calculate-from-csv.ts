import { handleParseTransactions } from "./parse-transactions.js";
import {
  handleClassifyInstruments,
  type ClassifyInstrumentsExtra,
} from "./classify-instruments.js";
import { handleCalculateGains } from "./calculate-gains.js";
import type {
  CalculateFromCsvInput,
  ClassificationMap,
  GainsReport,
  IncomeRow,
  Transaction,
} from "../../types.js";

/**
 * Minimal HTTP-POST seam for test injection. Structurally identical to
 * `Classifier.classify()`'s own `_httpPost` parameter
 * (`src/classifier/index.ts`) and to `classify-instruments.ts`'s
 * re-declaration of it — not exported from either (a private test seam), so
 * re-declared here too. Forwarded as-is into the internal
 * `handleClassifyInstruments` call this handler makes; left `undefined` in
 * real server wiring, which falls through to `Classifier`'s real `httpsPost`.
 */
type HttpPost = (
  url: string,
  body: string,
  timeoutMs: number,
) => Promise<{ status: number; data: string }>;

/**
 * The MCP SDK's `CallToolResult` shape, narrowed to the single
 * `{ type: "text" }` content entry every handler in `src/mcp/tools/`
 * returns. Declared structurally (not imported from the SDK) purely so this
 * file can type the results it receives back from the three composed
 * handlers and pass an error result through unchanged.
 */
interface ToolCallResult {
  isError?: true;
  content: Array<{ type: "text"; text: string }>;
}

function parseJson<T>(result: ToolCallResult): T {
  return JSON.parse(result.content[0].text) as T;
}

/**
 * An "unresolved" ISIN is exactly one `classify_instruments` could not
 * confidently classify on its own — an OpenFIGI unknown/missing security
 * type, or an `offline: true` stub — and is therefore stamped
 * `source: "user"`/`confirmedByUser: false` (see `Classifier`'s
 * `classifyByType`/offline-stub paths, `src/classifier/index.ts`). Every
 * ISIN gets a classification-map entry regardless of resolution outcome, so
 * this is a scan of `confirmedByUser`/`source`, never a "missing key" check.
 * An `overrides`-supplied entry is `confirmedByUser: true` regardless of how
 * it was resolved, so it never matches this filter. This mirrors
 * `classify-instruments.ts`'s own (module-private) `buildUnresolvedWarnings`
 * scan, extracting the ISIN codes themselves instead of warning strings.
 */
function collectUnresolvedIsins(classification: ClassificationMap): string[] {
  const unresolved: string[] = [];
  for (const [isin, entry] of Object.entries(classification)) {
    if (entry.source === "user" && !entry.confirmedByUser) {
      unresolved.push(isin);
    }
  }
  return unresolved;
}

/**
 * MCP tool handler for `calculate_from_csv` (v0.13.0, Part 19). A direct
 * in-process composition of the three Part 15 handlers —
 * `handleParseTransactions` → `handleClassifyInstruments` →
 * `handleCalculateGains` — so an LLM-orchestrated caller only ever has to
 * relay the original CSV text, never a parsed `Transaction[]` re-emitted as
 * a tool-call argument (the round-trip risk Part 19's PRD documents). No new
 * parsing/classification/calculation logic lives here — this handler is
 * exclusively plumbing between the three existing handlers.
 *
 * Best-effort semantics are inherited, not invented: any ISIN
 * `classify_instruments` can't resolve still gets a classification-map
 * entry (an unknown-type/offline stub, routed to Bucket B by that stub's own
 * `bucketGain`/`bucketLoss`, `src/classifier/index.ts`), so `Calculator`
 * computes a full report exactly as a direct `calculate_gains` caller would
 * get today — this handler adds no special-casing on top of it. It only
 * surfaces *which* ISINs landed there via `unresolvedIsins`, so a caller can
 * offer a correction retry instead of having to notice a warning buried in
 * `warnings` on their own.
 *
 * `carryForward` is forwarded to the internal `calculate_gains` call as-is —
 * it's external state (prior-year losses) the composed CSV parse has no way
 * to derive, so a caller must resupply it on every call, including a
 * correction retry (omitting it there silently loses its effect — a
 * documented statelessness risk, not a bug this handler works around).
 *
 * `incomeRows`, unlike `carryForward`, needs no external input: it's derived
 * from the same `csv` this handler already parsed via
 * `handleParseTransactions`, so it's wired into the internal
 * `calculate_gains` call automatically.
 *
 * `extra` (the MCP `_meta.progressToken`/`sendNotification` pair) is
 * forwarded verbatim into the internal `classify_instruments` call (Task 66
 * / TC-244), the same slice of `RequestHandlerExtra`
 * `classify-instruments.ts` itself declares
 * (`src/mcp/tools/classify-instruments.ts:33-40`) and `server.ts` passes it
 * a direct `classify_instruments` call. Without this explicit forwarding,
 * multi-batch OpenFIGI progress notifications would never fire for
 * `calculate_from_csv` regardless of transport/client support — a strictly
 * worse failure than a client simply not displaying them. `extra` is fully
 * optional (a direct unit-test invocation, or a client that never asked for
 * progress, omits it) and this handler completes identically either way.
 *
 * Any error from a composed step (`ParseError`/`ClassificationError`/
 * `CalculationError`) is returned exactly as that step's own handler shaped
 * it, unchanged — no new error-handling logic here, so error shapes stay
 * byte-for-byte identical to a direct `parse_transactions`/
 * `classify_instruments`/`calculate_gains` call (Task 66 / TC-243).
 */
export async function handleCalculateFromCsv(
  args: CalculateFromCsvInput,
  extra?: ClassifyInstrumentsExtra,
  _httpPost?: HttpPost,
): Promise<ToolCallResult> {
  const parseResult = (await handleParseTransactions({
    csv: args.csv,
  })) as ToolCallResult;
  if (parseResult.isError) return parseResult;
  const {
    transactions,
    warnings: parseWarnings,
    incomeRows,
  } = parseJson<{
    transactions: Transaction[];
    warnings: string[];
    incomeRows: IncomeRow[];
  }>(parseResult);

  const classifyResult = (await handleClassifyInstruments(
    { transactions, overrides: args.overrides, offline: args.offline },
    extra,
    _httpPost,
  )) as ToolCallResult;
  if (classifyResult.isError) return classifyResult;
  const { classification, warnings: classifyWarnings } = parseJson<{
    classification: ClassificationMap;
    warnings: string[];
  }>(classifyResult);

  const calculateResult = (await handleCalculateGains({
    transactions,
    method: args.method,
    parseWarnings,
    classification,
    carryForward: args.carryForward,
    incomeRows,
  })) as ToolCallResult;
  if (calculateResult.isError) return calculateResult;
  const report = parseJson<GainsReport>(calculateResult);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          report,
          // Parser + calculator warnings are already merged into
          // report.warnings (Calculator prepends the parseWarnings we passed
          // above to its own generated warnings, see `_parseWarnings` in
          // `src/calculator/index.ts`); classify_instruments' unresolved-ISIN
          // warnings live in a separate array entirely (`Classifier.classify()`
          // never returns them attached to the classification map itself), so
          // they're concatenated in here.
          warnings: [...report.warnings, ...classifyWarnings],
          unresolvedIsins: collectUnresolvedIsins(classification),
        }),
      },
    ],
  };
}
