import { ParseError } from "../../errors.js";
import { classifyToSidecar } from "./classify-core.js";
import { parseMultipleFiles, MultiFileError } from "../multi-file.js";
import type { Broker } from "../multi-file.js";
import type { LocaleStrings } from "../../i18n/types.js";
import { renderSegments } from "../colors.js";

// Palette (Part 18): red for the hard TTY-precondition error. This is checked ahead of the
// shared try/catch in index.ts (Task 63's scope), so it's colored here directly rather than
// through that shared error-rendering pass.
const RED = "#F87171";

export async function runClassify(
  positional: string[],
  flags: Record<string, string | boolean>,
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  color: boolean = false,
): Promise<number> {
  const offline = Boolean(flags["offline"]);

  // TTY check — FIRST, before any file I/O
  if (!process.stdin.isTTY && !offline) {
    stderr.write(renderSegments([{ text: s.classifyNonTtyError, hex: RED }], color) + "\n");
    return 2;
  }

  const files = positional;
  if (files.length === 0) {
    stderr.write("Usage: minus-tracker classify [--offline] <file.csv> [file2.csv ...]\n");
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

  // --sidecar: optional at N=1 (derived from the single file, as before),
  // required at N>1 (TC-182, classify slice).
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

  // Sidecar path: explicit --sidecar, or (N=1 only) derived from the
  // single input file — same rule as `calc` (Task 53).
  const sidecarPath =
    sidecarFlag ?? files[0].replace(/\.csv$/i, "") + ".classify.json";

  // classifyToSidecar/Classifier.classify() already dedupes ISINs within
  // whatever transaction list they're given — feeding it the cross-file
  // merged list here is what makes TC-194's cross-file dedup work, with no
  // separate multi-file-specific dedup path.
  await classifyToSidecar(
    parsed.transactions,
    sidecarPath,
    { offline },
    s,
    stdout,
    color,
  );
  return 0;
}
