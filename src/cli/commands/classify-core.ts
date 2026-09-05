import * as fs from "node:fs";
import * as path from "node:path";
import { Classifier } from "../../classifier/index.js";
import { colorize } from "../colors.js";
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
 * otherwise prompts before overwriting an existing sidecar's confirmed
 * entries.
 *
 * `color` (Part 18 — CLI Color Output, Task 60) styles `classifyWritten`
 * green and `classifyOfflineWarning` amber; `classifyMergePrompt` is an
 * interactive prompt, not a signal, so it stays unstyled regardless of
 * `color`. Defaults to `false` so every pre-v0.12.0 call site (this
 * function's own default parameter list, `calc`'s auto-classify path) keeps
 * rendering unstyled output until its own caller threads a real value
 * through — `calc`'s auto-classify path picks up real coloring identically,
 * with no separate wiring, once it does.
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
    stdout.write(colorize(s.classifyOfflineWarning, "#FBBF24", color) + "\n");
    const classifier = new Classifier();
    const classification = await classifier.classify(
      transactions,
      sidecarPath,
      {
        offline: true,
      },
    );
    stdout.write(
      colorize(s.classifyWritten(path.resolve(sidecarPath)), "#4ADE80", color) +
        "\n",
    );
    return classification;
  }

  const classifier = new Classifier();

  if (fs.existsSync(sidecarPath)) {
    const existingMap = await classifier.load(sidecarPath);
    const confirmedCount = Object.values(existingMap).filter(
      (e) => e.confirmedByUser,
    ).length;
    // Always unstyled — a prompt, not a signal (TC-219).
    stdout.write(s.classifyMergePrompt(confirmedCount));

    const answer = await readLine(stdin);
    if (answer.trim().toLowerCase() === "n") {
      return existingMap;
    }
  }

  const classification = await classifier.classify(transactions, sidecarPath);
  stdout.write(
    colorize(s.classifyWritten(path.resolve(sidecarPath)), "#4ADE80", color) +
      "\n",
  );
  return classification;
}
