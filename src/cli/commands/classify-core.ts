import * as fs from "node:fs";
import * as path from "node:path";
import { Classifier } from "../../classifier/index.js";
import type { LocaleStrings } from "../../i18n/types.js";
import type { ClassificationMap, Transaction } from "../../types.js";
import { renderSegments } from "../colors.js";

// Palette (Part 18) — mirrors the roles this module's own output uses: green for a
// successful sidecar write, amber for the offline-mode warning. `classifyMergePrompt`
// takes no hex — it is an interactive prompt, not a status signal, and stays unstyled
// regardless of `color`.
const GREEN = "#4ADE80";
const AMBER = "#FBBF24";

export function readLine(stream: NodeJS.ReadableStream): Promise<string> {
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

/**
 * Runs classification and writes the sidecar, shared by `classify` (explicit
 * invocation) and `calc` (automatic invocation). Offline mode skips OpenFIGI;
 * otherwise prompts before overwriting an existing sidecar's confirmed
 * entries.
 */
export async function classifyToSidecar(
  transactions: Transaction[],
  sidecarPath: string,
  opts: { offline: boolean },
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  color: boolean = false,
  stdin: NodeJS.ReadableStream = process.stdin,
): Promise<ClassificationMap> {
  if (opts.offline) {
    stdout.write(
      renderSegments([{ text: s.classifyOfflineWarning, hex: AMBER }], color) + "\n",
    );
    const classifier = new Classifier();
    const classification = await classifier.classify(
      transactions,
      sidecarPath,
      {
        offline: true,
      },
    );
    stdout.write(
      renderSegments(
        [{ text: s.classifyWritten(path.resolve(sidecarPath)), hex: GREEN }],
        color,
      ) + "\n",
    );
    return classification;
  }

  const classifier = new Classifier();

  if (fs.existsSync(sidecarPath)) {
    const existingMap = await classifier.load(sidecarPath);
    const confirmedCount = Object.values(existingMap).filter(
      (e) => e.confirmedByUser,
    ).length;
    // No hex — always unstyled, per Part 18 (an interactive prompt, not a status signal).
    stdout.write(renderSegments([{ text: s.classifyMergePrompt(confirmedCount) }], color));

    const answer = await readLine(stdin);
    if (answer.trim().toLowerCase() === "n") {
      return existingMap;
    }
  }

  const classification = await classifier.classify(transactions, sidecarPath);
  stdout.write(
    renderSegments(
      [{ text: s.classifyWritten(path.resolve(sidecarPath)), hex: GREEN }],
      color,
    ) + "\n",
  );
  return classification;
}
