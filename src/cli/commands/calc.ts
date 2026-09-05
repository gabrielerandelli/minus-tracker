import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Calculator } from "../../calculator/index.js";
import { Classifier } from "../../classifier/index.js";
import { ParseError, CalculationError } from "../../errors.js";
import { renderReport } from "../renderer.js";
import { classifyToSidecar } from "./classify-core.js";
import { parseMultipleFiles, MultiFileError } from "../multi-file.js";
import type { Broker } from "../multi-file.js";
import type { LocaleStrings } from "../../i18n/types.js";
import type {
  LotMethod,
  ClassificationMap,
  CarryForward,
} from "../../types.js";

export async function runCalc(
  positional: string[],
  flags: Record<string, string | boolean>,
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  color = false,
): Promise<number> {
  const files = positional;
  if (files.length === 0) {
    stderr.write(
      "Usage: minus-tracker calc [--method LIFO|FIFO] [--offline] [--json] <file.csv> [file2.csv ...]\n",
    );
    return 2;
  }
  const filePath = files[0];
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

  // --sidecar: optional at N=1 (derived from the single file, as before),
  // required at N>1 (TC-182).
  const sidecarFlag = flags["sidecar"] as string | undefined;
  if (multi && sidecarFlag === undefined) {
    stderr.write(s.errorMultiFileOutputRequired("--sidecar") + "\n");
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
          stderr.write(s.errorCannotReadFile(err.file!) + "\n");
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
  const transactions = parsed.transactions;

  const method = (flags["method"] as LotMethod) ?? "LIFO";
  if (method !== "LIFO" && method !== "FIFO") {
    stderr.write("--method must be LIFO or FIFO\n");
    return 2;
  }

  // --export-dichiarazione flag parsing. The optional-value convenience
  // (auto-derive the path from the single input file) applies only at
  // N=1 (TC-183); at N>1 a bare flag with no explicit path is a usage
  // error, since there's no single file to derive a default from.
  const exportFlagRaw = flags["export-dichiarazione"];
  const exportRequested =
    exportFlagRaw !== undefined && exportFlagRaw !== false;
  if (exportRequested && multi && typeof exportFlagRaw !== "string") {
    stderr.write(
      s.errorMultiFileOutputRequired("--export-dichiarazione") + "\n",
    );
    return 2;
  }
  const exportPath =
    typeof exportFlagRaw === "string"
      ? exportFlagRaw
      : filePath.replace(/\.csv$/i, "") + ".dichiarazione.json";

  // --year: sets CalculatorOptions.taxYear, scoping the report to that year.
  const yearFlag = flags["year"] as string | undefined;
  const taxYear = yearFlag !== undefined ? parseInt(yearFlag, 10) : undefined;

  // --carry-forward flag parsing
  const rawCf: unknown = flags["carry-forward"];
  const rawCarryForwards: string[] = Array.isArray(rawCf)
    ? (rawCf as string[])
    : rawCf
      ? [rawCf as string]
      : [];

  const cfRegex = /^\d{4}:\d+(\.\d+)?$/;
  for (const cf of rawCarryForwards) {
    if (!cfRegex.test(cf)) {
      stderr.write(s.carryForwardInvalidFormat + "\n");
      return 2;
    }
  }

  // Load carry-forward config file
  const xdgConfig =
    process.env["XDG_CONFIG_HOME"] ?? path.join(os.homedir(), ".config");
  const cfConfigPath = path.join(
    xdgConfig,
    "minus-tracker",
    "carryforward.json",
  );
  const cfFromFile: Record<number, number> = {};
  if (fs.existsSync(cfConfigPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cfConfigPath, "utf-8")) as {
        losses?: Array<{ year: number; amount: number }>;
      };
      for (const entry of raw.losses ?? []) {
        cfFromFile[entry.year] = entry.amount;
      }
    } catch {
      /* silently skip malformed config */
    }
  }

  // Merge: flag wins over config file
  const cfMerged: Record<number, number> = { ...cfFromFile };
  for (const cf of rawCarryForwards) {
    const [yearStr, amountStr] = cf.split(":");
    cfMerged[parseInt(yearStr, 10)] = parseFloat(amountStr);
  }
  const carryForward: CarryForward[] = Object.entries(cfMerged).map(
    ([year, amount]) => ({ year: parseInt(year, 10), amount }),
  );

  // Sidecar path: explicit --sidecar, or (N=1 only) auto-derived — reuse
  // it if present, otherwise auto-classify.
  const sidecarPath =
    sidecarFlag ?? filePath.replace(/\.csv$/i, "") + ".classify.json";
  let classification: ClassificationMap | undefined;
  if (fs.existsSync(sidecarPath)) {
    try {
      const classifier = new Classifier();
      classification = await classifier.load(sidecarPath);
    } catch {
      stderr.write(s.errorCannotLoadSidecar(sidecarPath) + "\n");
      return 1;
    }
  } else {
    const offlineFlag = Boolean(flags["offline"]);
    const isTty = process.stdin.isTTY === true;
    const offline = offlineFlag || !isTty;

    if (offline && !offlineFlag) {
      stderr.write(s.autoClassifyOfflineNotice + "\n");
    }

    // In --json mode, keep classify's human-readable status lines off of
    // stdout so it stays pure, parseable JSON.
    classification = await classifyToSidecar(
      transactions,
      sidecarPath,
      { offline },
      s,
      flags["json"] ? stderr : stdout,
    );
  }

  const calculator = new Calculator(transactions, parsed.warnings, {
    classification,
    carryForward: carryForward.length > 0 ? carryForward : undefined,
    incomeRows: parsed.incomeRows,
    taxYear,
  });
  let report;
  try {
    report = calculator.calculateGains(method);
  } catch (err) {
    if (err instanceof CalculationError && err.code === "AMBIGUOUS_TAX_YEAR") {
      stderr.write(s.errorAmbiguousTaxYear(err.years!) + "\n");
      return 1;
    }
    throw err;
  }
  const carryForwardWasProvided = carryForward.length > 0;

  if (exportRequested) {
    try {
      await report.dichiarazione!.exportTo(exportPath);
    } catch {
      stderr.write(s.errorCannotWriteExport(exportPath) + "\n");
      return 1;
    }
  }

  if (flags["json"]) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { dichiarazione: _dichiarazione, ...jsonReport } = report;
    stdout.write(JSON.stringify(jsonReport, null, 2) + "\n");
  } else {
    stdout.write(
      renderReport(report, s, carryForwardWasProvided, color) + "\n",
    );
  }

  if (exportRequested) {
    stdout.write(s.classifyWritten(exportPath) + "\n");
  }

  return 0;
}
