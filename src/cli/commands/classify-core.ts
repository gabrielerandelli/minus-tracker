import * as fs from "node:fs";
import * as path from "node:path";
import { Classifier } from "../../classifier/index.js";
import type { LocaleStrings } from "../../i18n/types.js";
import type { ClassificationMap, Transaction } from "../../types.js";

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
 * interactive mode prompts before overwriting an existing sidecar's confirmed
 * entries.
 */
export async function classifyToSidecar(
  transactions: Transaction[],
  sidecarPath: string,
  opts: { offline: boolean; interactive: boolean },
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  stdin: NodeJS.ReadableStream = process.stdin,
): Promise<ClassificationMap> {
  if (opts.offline) {
    stdout.write(s.classifyOfflineWarning + "\n");
    const classifier = new Classifier({ interactive: false });
    const classification = await classifier.classify(
      transactions,
      sidecarPath,
      {
        offline: true,
      },
    );
    stdout.write(s.classifyWritten(path.resolve(sidecarPath)) + "\n");
    return classification;
  }

  const classifier = new Classifier({ interactive: opts.interactive });

  if (fs.existsSync(sidecarPath)) {
    const existingMap = await classifier.load(sidecarPath);
    const confirmedCount = Object.values(existingMap).filter(
      (e) => e.confirmedByUser,
    ).length;
    stdout.write(s.classifyMergePrompt(confirmedCount));

    const answer = await readLine(stdin);
    if (answer.trim().toLowerCase() === "n") {
      return existingMap;
    }
  }

  const classification = await classifier.classify(transactions, sidecarPath);
  stdout.write(s.classifyWritten(path.resolve(sidecarPath)) + "\n");
  return classification;
}
