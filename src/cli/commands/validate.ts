import * as fs from "node:fs";
import { DEGIROParser } from "../../parser/index.js";
import { IBKRParser } from "../../parser/ibkr.js";
import { ParseError } from "../../errors.js";
import { detectBroker } from "../broker-detect.js";
import type { LocaleStrings } from "../../i18n/types.js";
import type { Parser } from "../../types.js";

export async function runValidate(
  positional: string[],
  flags: Record<string, string | boolean>,
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): Promise<number> {
  const filePath = positional[0];
  if (!filePath) {
    stderr.write("Usage: minus-tracker validate <file.csv>\n");
    return 2;
  }

  let csv: string;
  try {
    csv = fs.readFileSync(filePath, "utf8");
  } catch {
    stderr.write(`Cannot read file: ${filePath}\n`);
    return 1;
  }

  const brokerFlag = flags["broker"] as string | undefined;
  if (
    brokerFlag !== undefined &&
    brokerFlag !== "degiro" &&
    brokerFlag !== "ibkr"
  ) {
    stderr.write("--broker must be degiro or ibkr\n");
    return 2;
  }
  const broker = brokerFlag ?? detectBroker(csv);
  if (broker === null) {
    stderr.write(s.errorBrokerDetectionFailed + "\n");
    return 2;
  }
  const parser: Parser =
    broker === "degiro" ? new DEGIROParser() : new IBKRParser();
  let transactions;
  try {
    transactions = parser.parse(csv);
  } catch (err) {
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

  stdout.write(s.validateOk(transactions.length, 0) + "\n");

  for (const entry of parser.warningEntries) {
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
    }
    stdout.write(reason + "\n");
  }

  return 0;
}
