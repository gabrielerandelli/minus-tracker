import * as fs from "node:fs";
import { DEGIROParser } from "../../parser/index.js";
import { IBKRParser } from "../../parser/ibkr.js";
import { ParseError } from "../../errors.js";
import { detectBroker } from "../broker-detect.js";
import { classifyToSidecar } from "./classify-core.js";
import type { LocaleStrings } from "../../i18n/types.js";
import type { Parser } from "../../types.js";

export async function runClassify(
  positional: string[],
  flags: Record<string, string | boolean>,
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): Promise<number> {
  const offline = Boolean(flags["offline"]);

  // TTY check — FIRST, before any file I/O
  if (!process.stdin.isTTY && !offline) {
    stderr.write(s.classifyNonTtyError + "\n");
    return 2;
  }

  const csvPath = positional[0];
  if (!csvPath) {
    stderr.write("Usage: minus-tracker classify [--offline] <file.csv>\n");
    return 2;
  }

  let csv: string;
  try {
    csv = fs.readFileSync(csvPath, "utf8");
  } catch {
    stderr.write(`Cannot read file: ${csvPath}\n`);
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

  // Derive sidecar path: replace .csv extension with .classify.json
  const base = csvPath.replace(/\.csv$/i, "");
  const sidecarPath = base + ".classify.json";

  await classifyToSidecar(transactions, sidecarPath, { offline }, s, stdout);
  return 0;
}
