import { Classifier } from "../../classifier/index.js";
import { ClassificationError } from "../../errors.js";
import type {
  ClassificationMap,
  ClassifyInstrumentsInput,
} from "../../types.js";
import { toClassificationErrorResult } from "../errors.js";

/**
 * Minimal HTTP-POST seam mirroring `Classifier.classify()`'s own `_httpPost`
 * test-injection parameter (see `src/classifier/index.ts`). Not exported from
 * that module (private test seam), so re-declared structurally here — any
 * function matching this call signature (including the real `httpsPost`
 * default inside `Classifier.classify()`, used when this is left `undefined`)
 * satisfies it.
 */
type HttpPost = (
  url: string,
  body: string,
  timeoutMs: number,
) => Promise<{ status: number; data: string }>;

/** The `notifications/progress` JSON-RPC notification shape (MCP spec). */
export interface ProgressNotification {
  method: "notifications/progress";
  params: {
    progressToken: string | number;
    progress: number;
    total?: number;
  };
}

/**
 * The slice of the MCP SDK's `RequestHandlerExtra` (passed by
 * `Server#setRequestHandler` to every tool-call handler) that this tool
 * needs: the original request's `_meta.progressToken` (if the client asked
 * for progress notifications) and the `sendNotification` callback used to
 * emit them. Declared structurally (not imported from the SDK) so this
 * handler stays easy to unit-test with a plain fake object — the real SDK
 * `RequestHandlerExtra` satisfies this shape.
 */
export interface ClassifyInstrumentsExtra {
  _meta?: { progressToken?: string | number };
  sendNotification?: (notification: ProgressNotification) => Promise<void>;
}

/**
 * `classify()` (stateless mode) does not return its internal per-ISIN
 * warnings — it only returns the merged `ClassificationMap` (see
 * `src/classifier/index.ts` and TC-101's note on this). Any entry that came
 * back unresolved (OpenFIGI had no/unknown-type match, or `offline: true`
 * stubbed it) is marked `confirmedByUser: false, source: "user"` — the same
 * marker shape `Classifier` itself uses internally for this case. Overrides
 * and legitimately-resolved OpenFIGI entries never match this combination
 * (overrides set `confirmedByUser: true`; resolved entries have
 * `source: "openfigi"`), so scanning the merged map for it reconstructs the
 * `classifyUnknownType`-style warnings the MCP contract expects.
 */
function buildUnresolvedWarnings(classification: ClassificationMap): string[] {
  const warnings: string[] = [];
  for (const [isin, entry] of Object.entries(classification)) {
    if (!entry.confirmedByUser && entry.source === "user") {
      warnings.push(
        `Unrecognized type for ${isin}: unknown. Please classify manually.`,
      );
    }
  }
  return warnings;
}

/**
 * MCP tool handler for `classify_instruments`. Thin adapter over
 * `Classifier.classify()`'s stateless mode (Tasks 29+30) — `sidecarPath` is
 * always omitted, so no `.classify.json` is ever read or written.
 *
 * Progress: if `extra._meta.progressToken` is present and `extra` provides
 * `sendNotification`, each completed OpenFIGI batch is bridged to a
 * `notifications/progress` message. Without a `progressToken` (or without
 * `extra` at all — e.g. direct unit-test invocation), `onBatchProgress` is a
 * no-op and the call completes identically.
 *
 * `_httpPost` is an optional last parameter purely for test injection,
 * mirroring `Classifier.classify()`'s own seam — left `undefined` in the real
 * server.ts wiring, which falls through to `Classifier`'s real `httpsPost`.
 */
export async function handleClassifyInstruments(
  args: ClassifyInstrumentsInput,
  extra?: ClassifyInstrumentsExtra,
  _httpPost?: HttpPost,
) {
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

  const classifier = new Classifier({ interactive: false });

  try {
    const classification = await classifier.classify(
      args.transactions,
      undefined,
      {
        existingClassification: args.existingClassification,
        overrides: args.overrides,
        offline: args.offline,
        onBatchProgress,
      },
      _httpPost,
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            classification,
            warnings: buildUnresolvedWarnings(classification),
          }),
        },
      ],
    };
  } catch (err) {
    if (err instanceof ClassificationError)
      return toClassificationErrorResult(err);
    throw err;
  }
}
