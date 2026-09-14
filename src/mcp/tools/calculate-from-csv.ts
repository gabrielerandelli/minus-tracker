import type {
  CalculateFromCsvInput,
  ClassificationMap,
  GainsReport,
  IncomeRow,
  Transaction,
} from "../../types.js";
import { handleParseTransactions } from "./parse-transactions.js";
import {
  handleClassifyInstruments,
  type ClassifyInstrumentsExtra,
} from "./classify-instruments.js";
import { handleCalculateGains } from "./calculate-gains.js";

/**
 * Minimal HTTP-POST test-injection seam, re-declared structurally here for
 * the same reason `classify-instruments.ts` re-declares it: it is not
 * exported from `Classifier.classify()`. Forwarded verbatim into the
 * internal `handleClassifyInstruments` call below; left `undefined` in the
 * real `server.ts` wiring, which falls through to the real `httpsPost`.
 */
type HttpPost = (
  url: string,
  body: string,
  timeoutMs: number,
) => Promise<{ status: number; data: string }>;

interface CalculateFromCsvErrorResult {
  isError: true;
  content: [{ type: "text"; text: string }];
}

interface CalculateFromCsvOkResult {
  isError?: undefined;
  content: [{ type: "text"; text: string }];
}

type CalculateFromCsvResult =
  | CalculateFromCsvErrorResult
  | CalculateFromCsvOkResult;

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
  return Object.entries(classification)
    .filter(([, entry]) => !entry.confirmedByUser && entry.source === "user")
    .map(([isin]) => isin)
    .sort();
}

/**
 * MCP tool handler for `calculate_from_csv` (v0.13.0, Tasks 65-66) — a
 * single-call convenience wrapper directly composing, in-process:
 *
 *   parse_transactions -> classify_instruments -> calculate_gains
 *
 * This is pure composition, not new tax logic: each step delegates to the
 * already-shipped granular tool handler, so best-effort semantics
 * (Bucket-B default for any ISIN `Calculator` doesn't find in the
 * classification map — see `src/calculator/index.ts:277-281`) and every
 * error code come from those handlers unchanged (Task 66 / TC-243: error
 * shapes below are byte-for-byte what a direct call to the composed tool
 * would return, since they're the exact same `toXErrorResult()` payloads,
 * not re-derived here).
 *
 * `existingClassification`/`overrides`/`offline` are forwarded as-is into
 * the internal `classify_instruments` call; `carryForward` is forwarded as
 * external state `calculate_gains` needs (a composed CSV parse has no way to
 * derive it — a correction retry that omits it silently loses its effect, a
 * documented statelessness risk, not a bug: TC-241). `incomeRows` needs no
 * external input: it's derived from the same `csv` this handler already
 * parsed via `handleParseTransactions`, so it's wired into the internal
 * `calculate_gains` call automatically (TC-242).
 *
 * The returned `warnings` merges `calculate_gains`' own `report.warnings`
 * (which already carries the `parseWarnings` forwarded above, prepended by
 * `Calculator`) with `classify_instruments`' unresolved-ISIN warnings —
 * `Classifier.classify()` never returns those attached to the classification
 * map itself, so without this concatenation they'd be silently dropped from
 * a composed call even though `unresolvedIsins` still names the ISIN
 * (TC-236/TC-237).
 *
 * `extra` (the MCP `_meta.progressToken`/`sendNotification` pair) is
 * forwarded as-is into the internal `classify_instruments` call (Task 66 /
 * TC-244) — without this, OpenFIGI batch-progress notifications could never
 * fire for `calculate_from_csv` regardless of transport/client support, a
 * strictly worse failure than a client simply not displaying them.
 *
 * `_httpPost` is an optional last parameter purely for test injection,
 * mirroring `handleClassifyInstruments`'s own seam — left `undefined` in the
 * real `server.ts` wiring.
 */
export async function handleCalculateFromCsv(
  args: CalculateFromCsvInput,
  extra?: ClassifyInstrumentsExtra,
  _httpPost?: HttpPost,
): Promise<CalculateFromCsvResult> {
  const parseResult = await handleParseTransactions({ csv: args.csv });
  if ("isError" in parseResult && parseResult.isError)
    return parseResult as CalculateFromCsvErrorResult;

  const parsed = JSON.parse(parseResult.content[0]!.text) as {
    transactions: Transaction[];
    warnings: string[];
    incomeRows: IncomeRow[];
  };

  const classifyResult = await handleClassifyInstruments(
    {
      transactions: parsed.transactions,
      existingClassification: args.existingClassification,
      overrides: args.overrides,
      offline: args.offline,
    },
    extra,
    _httpPost,
  );
  if ("isError" in classifyResult && classifyResult.isError)
    return classifyResult as CalculateFromCsvErrorResult;

  const classified = JSON.parse(classifyResult.content[0]!.text) as {
    classification: ClassificationMap;
    warnings: string[];
  };

  const unresolvedIsins = collectUnresolvedIsins(classified.classification);

  const calcResult = await handleCalculateGains({
    transactions: parsed.transactions,
    method: args.method,
    parseWarnings: parsed.warnings,
    classification: classified.classification,
    carryForward: args.carryForward,
    incomeRows: parsed.incomeRows,
  });
  if ("isError" in calcResult && calcResult.isError)
    return calcResult as CalculateFromCsvErrorResult;

  const report = JSON.parse(calcResult.content[0]!.text) as GainsReport;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          report,
          warnings: [...report.warnings, ...classified.warnings],
          unresolvedIsins,
        }),
      },
    ],
  };
}
