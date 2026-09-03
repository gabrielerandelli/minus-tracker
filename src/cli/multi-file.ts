import * as fs from "node:fs";
import * as path from "node:path";
import { DEGIROParser } from "../parser/index.js";
import { IBKRParser } from "../parser/ibkr.js";
import { ParseError } from "../errors.js";
import { detectBroker } from "./broker-detect.js";
import { checkCsvValidity } from "../parser/validity.js";
import { warningToEnglish, WarningEntry } from "../parser/warnings.js";
import type { Transaction, IncomeRow, Parser } from "../types.js";

/**
 * Multi-file CLI input pipeline — Task 52 / docs/prd/17-multi-file-input.md.
 *
 * Shared plumbing consumed by `calc`, `validate`, and `classify` (Tasks
 * 53-55) so all three commands accept N positional CSV files instead of
 * exactly one: pre-flight duplicate-path rejection, per-file broker
 * detection/parsing (unchanged), concatenation, and cross-file
 * duplicate-row detection. No change to `DEGIROParser`, `IBKRParser`, or
 * `Classifier` beyond the one-line `Transaction.sourceRow` stamp each
 * parser now makes (see src/parser/index.ts and src/parser/ibkr.ts).
 */

export type Broker = "degiro" | "ibkr";

/**
 * `multiFileTag({file}) → "[{file}] "` is byte-identical in both supported
 * locales (see docs/prd/09-i18n.md's "Multi-file input keys" table), so it
 * is applied here directly as plain formatting rather than through
 * `LocaleStrings` — this module has no i18n dependency. Locale-*varying*
 * multi-file strings (`errorDuplicateFilePath`, `warnDuplicateRow`, ...)
 * are rendered by callers from the structured data this module returns
 * (`MultiFileError`, `DuplicateRowWarning`), not from anything here.
 *
 * At `multi === false` (single-file input) this is a no-op empty string —
 * the mechanism that makes N=1 output byte-for-byte unchanged (TC-180)
 * structural rather than a separate code branch, per the impl plan.
 */
export function multiFileTag(file: string, multi: boolean): string {
  return multi ? `[${file}] ` : "";
}

/** One cross-file duplicate-row match — see `parseMultipleFiles`'s step 4. */
export interface DuplicateRowWarning {
  file1: string;
  row1?: number;
  file2: string;
  row2?: number;
}

/** One input file's own parse result, kept ungrouped for per-file rendering (e.g. `validate`). */
export interface FileParseResult {
  /** The positional argument exactly as typed on the command line. */
  file: string;
  broker: Broker;
  transactions: Transaction[];
  /** This file's own warnings, untagged — locale-render via `warningEntries`, or read the English `warningToEnglish(...)` form. */
  warningEntries: WarningEntry[];
  incomeRows: IncomeRow[];
}

export interface MultiFileParseResult {
  /** Concatenated across all files, in file-argument order (chronological sort still happens inside `Calculator`). */
  transactions: Transaction[];
  /** Concatenated across all files, in file-argument order — no duplicate detection (out of scope for `IncomeRow[]`, per PRD Part 17). */
  incomeRows: IncomeRow[];
  /** English strings: multiFileTag-prefixed (N>1 only) per-file parser warnings, then any cross-file duplicate-row warnings. Matches the `GainsReport.warnings[]` convention (always English). */
  warnings: string[];
  /** Structured cross-file duplicate-row matches, for locale-aware re-rendering by callers (`s.warnDuplicateRow(...)`). */
  duplicateRows: DuplicateRowWarning[];
  /** One entry per input file, in argument order. */
  perFile: FileParseResult[];
}

export interface ParseMultipleFilesOptions {
  /** Forces this broker for every file, skipping auto-detection for all of them (existing `--broker` flag, applied uniformly). */
  broker?: Broker;
}

type MultiFileErrorCode =
  | "DUPLICATE_FILE_PATH"
  | "CANNOT_READ_FILE"
  | "INVALID_CSV"
  | "BROKER_DETECTION_FAILED";

/**
 * Usage/read/detection errors specific to the multi-file pipeline — kept
 * separate from `ParseError` (which stays reserved for the underlying
 * per-file `DEGIROParser`/`IBKRParser` parse failures, so existing
 * `err instanceof ParseError` call sites are unaffected).
 */
export class MultiFileError extends Error {
  readonly code: MultiFileErrorCode;
  /** Set only for `DUPLICATE_FILE_PATH` — the resolved absolute path shared by more than one argument. */
  readonly path?: string;
  /** Set for every other code — the offending file's positional argument, exactly as typed. */
  readonly file?: string;

  constructor(code: "DUPLICATE_FILE_PATH", path: string);
  constructor(
    code: "CANNOT_READ_FILE" | "INVALID_CSV" | "BROKER_DETECTION_FAILED",
    file: string,
  );
  constructor(code: MultiFileErrorCode, pathOrFile: string) {
    const msg =
      code === "DUPLICATE_FILE_PATH"
        ? `Duplicate file path: ${pathOrFile}`
        : code === "CANNOT_READ_FILE"
          ? `Cannot read file: ${pathOrFile}`
          : code === "INVALID_CSV"
            ? `Invalid CSV: unable to parse (${pathOrFile})`
            : `Unable to detect broker format (${pathOrFile})`;
    super(msg);
    this.name = "MultiFileError";
    this.code = code;
    if (code === "DUPLICATE_FILE_PATH") {
      this.path = pathOrFile;
    } else {
      this.file = pathOrFile;
    }
  }
}

/**
 * Cross-file duplicate-row comparison key — `(isin, date, type, quantity,
 * pricePerUnit, currency)` per docs/prd/17-multi-file-input.md. Currency is
 * included (beyond idea.md's original ISIN+date+quantity+price+type) so two
 * accounts trading the same instrument in different currencies on the same
 * day never false-positive (TC-190).
 */
function duplicateKey(t: Transaction): string {
  return [t.isin, t.date, t.type, t.quantity, t.pricePerUnit, t.currency].join(
    "|",
  );
}

function englishDuplicateRowWarning(d: DuplicateRowWarning): string {
  return (
    `suspected duplicate row: [${d.file2}] row ${d.row2 ?? "?"} matches ` +
    `[${d.file1}] row ${d.row1 ?? "?"} (same ISIN, date, quantity, price, type)`
  );
}

/**
 * Parses N CSV files (each broker auto-detected independently unless
 * `opts.broker` forces one uniformly) and merges them into one
 * `Transaction[]`/`IncomeRow[]` pair, with cross-file duplicate-row
 * detection. See docs/prd/17-multi-file-input.md for the full pipeline.
 *
 * @throws {MultiFileError} `DUPLICATE_FILE_PATH` — two positionals resolve
 *   to the same absolute path (checked before any file is read).
 * @throws {MultiFileError} `CANNOT_READ_FILE` — a file cannot be read from disk.
 * @throws {MultiFileError} `INVALID_CSV` / `BROKER_DETECTION_FAILED` —
 *   broker auto-detection failed for a file (mirrors the existing single-file
 *   `calc`/`validate` fallback logic).
 * @throws {ParseError} — the underlying `DEGIROParser`/`IBKRParser` failed on
 *   a file; when `files.length > 1`, `.message` is prefixed with
 *   `multiFileTag(file)` for the failing file only. Aborts immediately — no
 *   partial results are returned, even when earlier files parsed cleanly.
 */
export function parseMultipleFiles(
  files: string[],
  opts: ParseMultipleFilesOptions = {},
): MultiFileParseResult {
  const multi = files.length > 1;

  // --- Pre-flight (TC-181): duplicate resolved path, before any file is read ---
  const seen = new Set<string>();
  for (const file of files) {
    const abs = path.resolve(file);
    if (seen.has(abs)) {
      throw new MultiFileError("DUPLICATE_FILE_PATH", abs);
    }
    seen.add(abs);
  }

  // --- Per-file parse (TC-186, TC-192) ---
  const perFile: FileParseResult[] = [];
  for (const file of files) {
    let csv: string;
    try {
      csv = fs.readFileSync(file, "utf8");
    } catch {
      throw new MultiFileError("CANNOT_READ_FILE", file);
    }

    const broker: Broker | null = opts.broker ?? detectBroker(csv);
    if (broker === null) {
      // Mirrors calc.ts/validate.ts: detectBroker() is a cheap format
      // sniff, not a CSV validity check — distinguish "not CSV at all"
      // from "well-formed but unrecognized broker" before reporting.
      if (!checkCsvValidity(csv).valid) {
        throw new MultiFileError("INVALID_CSV", file);
      }
      throw new MultiFileError("BROKER_DETECTION_FAILED", file);
    }

    const parser: Parser =
      broker === "degiro" ? new DEGIROParser() : new IBKRParser();
    let transactions: Transaction[];
    try {
      transactions = parser.parse(csv);
    } catch (err) {
      if (err instanceof ParseError && multi) {
        // Same instance, same .code/.columnName/.sectionName — only the
        // message gains the failing file's tag. Files before this one
        // parsed fine and aren't part of the error, so they're untagged
        // (and, since we abort here, never surfaced at all).
        err.message = multiFileTag(file, true) + err.message;
      }
      throw err;
    }

    const warningEntries: WarningEntry[] =
      parser instanceof DEGIROParser || parser instanceof IBKRParser
        ? parser.warningEntries
        : [];

    perFile.push({
      file,
      broker,
      transactions,
      warningEntries,
      incomeRows: parser.incomeRows,
    });
  }

  // --- Concatenate (TC-187, TC-191), file-argument order ---
  const transactions: Transaction[] = [];
  const incomeRows: IncomeRow[] = [];
  const warnings: string[] = [];
  for (const pf of perFile) {
    transactions.push(...pf.transactions);
    incomeRows.push(...pf.incomeRows);
    for (const entry of pf.warningEntries) {
      warnings.push(multiFileTag(pf.file, multi) + warningToEnglish(entry));
    }
  }

  // --- Cross-file duplicate-row scan (TC-188, TC-189, TC-190) ---
  // Only pairs from two *different* files are ever compared (the i<j bound
  // below never revisits a file against itself), so same-file
  // duplicate-looking rows are never flagged (TC-189) by construction.
  const duplicateRows: DuplicateRowWarning[] = [];
  for (let i = 0; i < perFile.length; i++) {
    for (let j = i + 1; j < perFile.length; j++) {
      const a = perFile[i];
      const b = perFile[j];
      for (const ta of a.transactions) {
        const keyA = duplicateKey(ta);
        for (const tb of b.transactions) {
          if (duplicateKey(tb) === keyA) {
            const dup: DuplicateRowWarning = {
              file1: a.file,
              row1: ta.sourceRow,
              file2: b.file,
              row2: tb.sourceRow,
            };
            duplicateRows.push(dup);
            warnings.push(englishDuplicateRowWarning(dup));
          }
        }
      }
    }
  }
  // Rows are never removed — only warned about — matching the CLI's
  // existing warn-don't-erase posture (silent dedup risks discarding two
  // genuinely separate trades that happen to look identical).

  return { transactions, incomeRows, warnings, duplicateRows, perFile };
}
