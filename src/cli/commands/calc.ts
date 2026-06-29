import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DEGIROParser } from "../../parser/index.js";
import { Calculator } from "../../calculator/index.js";
import { Classifier } from "../../classifier/index.js";
import { ParseError } from "../../errors.js";
import { renderReport } from "../renderer.js";
import { getActiveSnapshot, isSnapshotStale } from "../../rates/index.js";
import { updateRates, getSnapshotPath } from "./rates.js";
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
): Promise<number> {
  const filePath = positional[0];
  if (!filePath) {
    stderr.write(
      "Usage: minus-tracker calc [--method LIFO|FIFO] [--json] <file.csv>\n",
    );
    return 2;
  }

  let csv: string;
  try {
    csv = fs.readFileSync(filePath, "utf8");
  } catch {
    stderr.write(`Cannot read file: ${filePath}\n`);
    return 1;
  }

  try {
    const snapshot = getActiveSnapshot();
    if (isSnapshotStale(snapshot)) {
      stderr.write(s.ratesAutoUpdateStart + "\n");
      try {
        await updateRates(getSnapshotPath(), stdout, stderr, s);
      } catch {
        stderr.write(s.ratesAutoUpdateFailed + "\n");
      }
    }
  } catch {
    // bundled snapshot missing and no user snapshot — updateRates will handle it
    stderr.write(s.ratesAutoUpdateStart + "\n");
    try {
      await updateRates(getSnapshotPath(), stdout, stderr, s);
    } catch {
      stderr.write(s.ratesAutoUpdateFailed + "\n");
    }
  }

  const method = (flags["method"] as LotMethod) ?? "LIFO";
  if (method !== "LIFO" && method !== "FIFO") {
    stderr.write("--method must be LIFO or FIFO\n");
    return 2;
  }

  // Sidecar auto-discovery
  const sidecarPath = filePath.replace(/\.csv$/i, "") + ".classify.json";
  let classification: ClassificationMap | undefined;
  if (fs.existsSync(sidecarPath)) {
    try {
      const classifier = new Classifier({ interactive: false });
      classification = await classifier.load(sidecarPath);
    } catch {
      stderr.write(`Cannot load sidecar: ${sidecarPath}\n`);
      return 1;
    }
  }

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

  const calculator = new Calculator(transactions, parser.warnings, {
    classification,
    carryForward: carryForward.length > 0 ? carryForward : undefined,
  });
  const report = calculator.calculateGains(method);

  if (flags["json"]) {
    stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    stdout.write(renderReport(report, s) + "\n");
  }
  return 0;
}
