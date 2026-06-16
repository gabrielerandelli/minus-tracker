import * as fs from "node:fs";
import { DEGIROParser } from "../../parser/index.js";
import { ParseError } from "../../errors.js";
import type { LocaleStrings } from "../../i18n/types.js";

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

  const parser = new DEGIROParser();
  let transactions;
  try {
    transactions = parser.parse(csv);
  } catch (err) {
    if (err instanceof ParseError) {
      if (err.code === "INVALID_CSV") {
        stderr.write(s.errorInvalidCsv + "\n");
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
        reason = s.warnMissingIsin(entry.row);
        break;
      case "UNSUPPORTED_CURRENCY":
        reason = s.warnUnsupportedCurrency(entry.row, entry.currency);
        break;
      case "NO_ECB_RATE":
        reason = s.warnNoEcbRate(entry.row, entry.currency, entry.date);
        break;
      case "QUANTITY_ZERO":
        reason = s.warnQuantityZero(entry.row);
        break;
    }
    stdout.write(reason + "\n");
  }

  return 0;
}
