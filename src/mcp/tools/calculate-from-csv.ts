import { handleParseTransactions } from "./parse-transactions.js";
import { handleClassifyInstruments } from "./classify-instruments.js";
import { handleCalculateGains } from "./calculate-gains.js";
import type {
  AssetClass,
  CarryForward,
  ClassificationMap,
  ClassifyInstrumentsInput,
  GainsReport,
  IncomeRow,
  LotMethod,
  Transaction,
} from "../../types.js";

/**
 * Minimal HTTP-POST seam mirroring `classify-instruments.ts`'s own
 * test-injection parameter (see `src/mcp/tools/classify-instruments.ts`).
 * Not exported from that module (private test seam), so re-declared
 * structurally here — forwarded as-is into the internal
 * `handleClassifyInstruments` call, and left `undefined` in real server
 * wiring, which falls through to `Classifier`'s real `httpsPost`.
 */
type HttpPost = (
  url: string,
  body: string,
  timeoutMs: number,
) => Promise<{ status: number; data: string }>;

/**
 * Input shape for `calculate_from_csv` (v0.13.0, Part 19). `overrides` reuses
 * `ClassifyInstrumentsInput`'s existing AJV-enum-validated `AssetClass` map
 * (`types.ts`) rather than a new free-form string field. `incomeRows` is
 * deliberately absent — unlike `carryForward` (external state a caller must
 * supply), it's derived from the same `csv` this tool already parses, so
 * this handler wires the parse step's own `incomeRows` into the internal
 * `calculate_gains` call automatically (see `handleCalculateFromCsv` below).
 */
export interface CalculateFromCsvInput {
  csv: string;
  method: LotMethod;
  overrides?: ClassifyInstrumentsInput["overrides"];
  offline?: boolean;
  carryForward?: CarryForward[];
}

/**
 * The MCP SDK's `CallToolResult` shape, narrowed to the single
 * `{ type: "text" }` content entry every handler in `src/mcp/tools/` returns.
 * Declared structurally (not imported from the SDK) purely so this file can
 * type the results it receives back from the three composed handlers and
 * pass them through unchanged on error.
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
 * type, or an `offline: true` stub — and therefore stamped
 * `source: "user"`/`confirmedByUser: false` (see `Classifier`'s
 * `classifyByType`/offline-stub paths, `src/classifier/index.ts`). An
 * `overrides`-supplied entry is `confirmedByUser: true` regardless of how it
 * was resolved, so it never matches this filter. This mirrors
 * `classify-instruments.ts`'s own (module-private) `buildUnresolvedWarnings`
 * scan, extracting the ISIN codes themselves instead of warning strings.
 */
function collectUnresolvedIsins(classification: ClassificationMap): string[] {
  const unresolved: string[] = [];
  for (const [isin, entry] of Object.entries(classification)) {
    if (!entry.confirmedByUser && entry.source === "user") {
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
 * relay the original CSV text, never a parsed `Transaction[]` re-emitted as a
 * tool-call argument (the round-trip risk Part 19's PRD documents). No new
 * parsing/classification/calculation logic lives here.
 *
 * Best-effort semantics are inherited, not invented: any ISIN
 * `classify_instruments` can't resolve still gets a classification map entry
 * (an unknown-type/offline stub), which `Calculator` already routes to
 * Bucket B on its own (`src/calculator/index.ts`) — this handler adds no
 * special-casing on top of it, it only surfaces which ISINs that happened to
 * via `unresolvedIsins` so a caller can offer a correction retry.
 *
 * `carryForward` is forwarded to the internal `calculate_gains` call as-is —
 * it's external state (prior-year losses) the composed CSV parse has no way
 * to derive, so a caller must resupply it on every call, including a
 * correction retry (omitting it there silently loses its effect — a
 * documented statelessness risk, not a bug this handler works around).
 *
 * `incomeRows`, unlike `carryForward`, needs no external input: it's derived
 * from the same `csv` this handler already parsed via `handleParseTransactions`,
 * so it's wired into the internal `calculate_gains` call automatically.
 *
 * `extra` (progressToken/sendNotification) forwarding into the inner
 * `classify_instruments` call, and MCP protocol registration, are added in a
 * later task — this handler does not yet forward multi-batch OpenFIGI
 * progress notifications.
 *
 * Any error from a composed step (`ParseError`/`ClassificationError`/
 * `CalculationError`) is returned exactly as that step's own handler shaped
 * it, unchanged — no new error-handling logic here, so error shapes stay
 * identical to a direct `parse_transactions`/`classify_instruments`/
 * `calculate_gains` call.
 */
export async function handleCalculateFromCsv(
  args: CalculateFromCsvInput,
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
    undefined,
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
          // above to its own generated warnings); classify_instruments'
          // unresolved-ISIN warnings live in a separate array entirely
          // (Classifier.classify() never returns them attached to the
          // classification map itself), so they're concatenated in here.
          warnings: [...report.warnings, ...classifyWarnings],
          unresolvedIsins: collectUnresolvedIsins(classification),
        }),
      },
    ],
  };
}
