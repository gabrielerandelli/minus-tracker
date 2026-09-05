import { ParseError } from "../../errors.js";
import { parseMultipleFiles, MultiFileError, multiFileTag } from "../multi-file.js";
import type { Broker, FileParseResult } from "../multi-file.js";
import type { LocaleStrings } from "../../i18n/types.js";
import { warningToEnglish, type WarningEntry } from "../../parser/warnings.js";
import { renderSegments } from "../colors.js";

// Part 18 palette (docs/prd/18-cli-color-output.md) — green/amber, not yet exposed as shared
// named constants elsewhere in colors.ts, so scoped here same as renderer.ts's own usage.
const GREEN = "#4ADE80";
const AMBER = "#FBBF24";

function renderWarningEntry(entry: WarningEntry, s: LocaleStrings): string {
  let reason: string;
  switch (entry.code) {
    case "MISSING_ISIN":
      reason = s.warnMissingIsin(entry.row, entry.section);
      break;
    case "UNSUPPORTED_CURRENCY":
      reason = s.warnUnsupportedCurrency(
        entry.row,
        entry.currency,
        entry.section,
      );
      break;
    case "NO_ECB_RATE":
      reason = s.warnNoEcbRate(
        entry.row,
        entry.currency,
        entry.date,
        entry.section,
      );
      break;
    case "QUANTITY_ZERO":
      reason = s.warnQuantityZero(entry.row);
      break;
    case "MISSING_ISIN_INCOME":
      reason = s.warnMissingIsinIncome(entry.row);
      break;
    case "ORPHAN_WITHHOLDING":
      reason = s.warnOrphanWithholding(entry.isin, entry.date);
      break;
    case "UNMATCHED_WITHHOLDING":
      reason = s.warnUnmatchedWithholding(entry.row, entry.section);
      break;
    default:
      // No localized LocaleStrings key exists for this code (pre-existing
      // gap, not introduced here) — fall back to the locale-agnostic
      // English rendering rather than leaving it unassigned.
      reason = warningToEnglish(entry);
      break;
  }
  return reason;
}

function renderFileBlock(
  pf: FileParseResult,
  multi: boolean,
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  color: boolean,
): void {
  // Whole-line coloring per the granularity rule (Part 18) — these are full sentences with no
  // single isolable value, so the block's own OK/warning lines share one aggregate-driven color:
  // green when this file has zero warnings, amber when it has at least one.
  const hex = pf.warningEntries.length > 0 ? AMBER : GREEN;
  stdout.write(
    renderSegments(
      [
        {
          text: multiFileTag(pf.file, multi) + s.validateOk(pf.transactions.length, 0),
          hex,
        },
      ],
      color,
    ) + "\n",
  );
  for (const entry of pf.warningEntries) {
    stdout.write(
      renderSegments(
        [{ text: multiFileTag(pf.file, multi) + renderWarningEntry(entry, s), hex }],
        color,
      ) + "\n",
    );
  }
}

export async function runValidate(
  positional: string[],
  flags: Record<string, string | boolean>,
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  color: boolean = false,
): Promise<number> {
  const files = positional;
  if (files.length === 0) {
    stderr.write("Usage: minus-tracker validate <file.csv> [file2.csv ...]\n");
    return 2;
  }
  const multi = files.length > 1;

  const brokerFlag = flags["broker"] as string | undefined;
  if (
    brokerFlag !== undefined &&
    brokerFlag !== "degiro" &&
    brokerFlag !== "ibkr"
  ) {
    stderr.write("--broker must be degiro or ibkr\n");
    return 2;
  }

  let parsed;
  try {
    parsed = parseMultipleFiles(files, {
      broker: brokerFlag as Broker | undefined,
    });
  } catch (err) {
    if (err instanceof MultiFileError) {
      switch (err.code) {
        case "DUPLICATE_FILE_PATH":
          stderr.write(s.errorDuplicateFilePath(err.path!) + "\n");
          return 2;
        case "CANNOT_READ_FILE":
          stderr.write(`Cannot read file: ${err.file}\n`);
          return 1;
        case "INVALID_CSV":
          stderr.write(s.errorInvalidCsv + "\n");
          return 1;
        case "BROKER_DETECTION_FAILED":
          stderr.write(s.errorBrokerDetectionFailed + "\n");
          return 2;
      }
    }
    if (err instanceof ParseError) {
      if (err.code === "INVALID_CSV") {
        stderr.write(s.errorInvalidCsv + "\n");
      } else if (err.code === "MISSING_SECTION") {
        stderr.write(s.errorMissingSection(err.sectionName!) + "\n");
      } else {
        stderr.write(s.errorMissingColumn(err.columnName!) + "\n");
      }
      return 1;
    }
    throw err;
  }

  for (const pf of parsed.perFile) {
    renderFileBlock(pf, multi, s, stdout, color);
  }

  if (multi) {
    const totalCount = parsed.perFile.reduce(
      (sum, pf) => sum + pf.transactions.length,
      0,
    );
    const perFileWarnings = parsed.perFile.reduce(
      (sum, pf) => sum + pf.warningEntries.length,
      0,
    );
    const totalWarnings = perFileWarnings + parsed.duplicateRows.length;
    // validateTotal's color is driven by its own {warnings} count (computed just above), not
    // re-derived from the last per-file block rendered above.
    const totalHex = totalWarnings > 0 ? AMBER : GREEN;

    stdout.write("\n");
    stdout.write(
      renderSegments(
        [{ text: s.validateTotal(totalCount, totalWarnings), hex: totalHex }],
        color,
      ) + "\n",
    );
    for (const dup of parsed.duplicateRows) {
      stdout.write(
        renderSegments(
          [
            {
              text: s.warnDuplicateRow(
                dup.file1,
                dup.row1 ?? 0,
                dup.file2,
                dup.row2 ?? 0,
              ),
              hex: AMBER,
            },
          ],
          color,
        ) + "\n",
      );
    }
  }

  return 0;
}
