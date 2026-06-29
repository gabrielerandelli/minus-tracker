import * as fs from "node:fs";
import * as path from "node:path";
import { DEGIROParser } from "../../parser/index.js";
import { Classifier } from "../../classifier/index.js";
import { ParseError } from "../../errors.js";
import type { LocaleStrings } from "../../i18n/types.js";
import type { ClassificationMap } from "../../types.js";

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

  // Derive sidecar path: replace .csv extension with .classify.json
  const base = csvPath.replace(/\.csv$/i, "");
  const sidecarPath = base + ".classify.json";

  if (offline) {
    // Offline mode: skip OpenFIGI; write stub user-confirmed entries for each unique ISIN
    stdout.write(s.classifyOfflineWarning + "\n");

    const isinToProduct = new Map<string, string>();
    for (const tx of transactions) {
      if (tx.isin && !isinToProduct.has(tx.isin)) {
        isinToProduct.set(tx.isin, tx.product);
      }
    }

    const classifications: ClassificationMap = {};
    for (const [isin, product] of isinToProduct.entries()) {
      classifications[isin] = {
        product,
        assetClass: "ETF",
        bucketGain: "A",
        bucketLoss: "B",
        taxRate: 0.26,
        whiteListed: null,
        confirmedByUser: true,
        source: "user",
      };
    }

    const sidecarContent = JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        classifications,
        warnings: [],
      },
      null,
      2,
    );

    try {
      fs.writeFileSync(sidecarPath, sidecarContent, "utf-8");
    } catch {
      stderr.write(`Cannot write sidecar: ${sidecarPath}\n`);
      return 1;
    }

    stdout.write(s.classifyWritten(sidecarPath) + "\n");
    return 0;
  }

  // Online interactive mode
  const classifier = new Classifier({ interactive: true });

  if (fs.existsSync(sidecarPath)) {
    const existingMap = await classifier.load(sidecarPath);
    const confirmedCount = Object.values(existingMap).filter(
      (e) => e.confirmedByUser,
    ).length;
    stdout.write(s.classifyMergePrompt(confirmedCount));

    const answer = await readLine(process.stdin);
    if (answer.trim().toLowerCase() === "n") {
      return 0;
    }
  }

  await classifier.classify(transactions, sidecarPath);
  stdout.write(s.classifyWritten(path.resolve(sidecarPath)) + "\n");
  return 0;
}

function readLine(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    const onData = (chunk: Buffer | string) => {
      buf += chunk.toString();
      const nl = buf.indexOf("\n");
      if (nl !== -1) {
        stream.removeListener("data", onData);
        resolve(buf.slice(0, nl));
      }
    };
    stream.on("data", onData);
  });
}
