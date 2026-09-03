import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";
import { resolveLocale, getStrings } from "../i18n/index.js";
import { ParseError, CalculationError } from "../errors.js";
import { runCalc } from "./commands/calc.js";
import { runValidate } from "./commands/validate.js";
import { runRates } from "./commands/rates.js";
import { runConfig } from "./commands/config.js";
import { runStressTest } from "./commands/stress-test.js";
import { runClassify } from "./commands/classify.js";
import { ClassificationError } from "../errors.js";
import { renderBanner } from "./banner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USAGE_LINE =
  "Usage: minus-tracker <calc|validate|rates|config|stress-test|classify> [options] [file]\n";

function getPackageVersion(): string {
  const pkgPath = path.join(__dirname, "../../package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    version: string;
  };
  return pkg.version;
}

export async function runCli(
  argv: string[],
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      lang: { type: "string" },
      broker: { type: "string" },
      method: { type: "string" },
      year: { type: "string" },
      json: { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      update: { type: "boolean", default: false },
      show: { type: "boolean", default: false },
      range: { type: "string" },
      keep: { type: "boolean", default: false },
      "output-dir": { type: "string" },
      offline: { type: "boolean", default: false },
      "carry-forward": { type: "string", multiple: true },
      "export-dichiarazione": { type: "string" },
      sidecar: { type: "string" },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  // Resolve locale once — exits 2 on invalid value
  const locale = resolveLocale(values.lang as string | undefined);
  const s = getStrings(locale);

  const command = positionals[0];
  const restPositionals = positionals.slice(1);
  const flags = values as Record<string, string | boolean>;

  const streamInfo = stdout as Partial<NodeJS.WriteStream>;
  const color = !process.env["NO_COLOR"] && !!streamInfo.isTTY;
  const width = streamInfo.columns;

  if (values.version) {
    stdout.write(
      renderBanner({
        mode: "compact",
        tagline: s.bannerTagline,
        version: getPackageVersion(),
        color,
        width,
      }) + "\n",
    );
    return 0;
  }

  if (values.help || !command) {
    const banner = renderBanner({
      mode: "full",
      tagline: s.bannerTagline,
      version: getPackageVersion(),
      color,
      width,
    });
    if (values.help) {
      stdout.write(banner + "\n" + USAGE_LINE);
      return 0;
    }
    stderr.write(banner + "\n" + USAGE_LINE);
    return 2;
  }

  let exitCode = 0;

  try {
    switch (command) {
      case "calc":
        exitCode = await runCalc(restPositionals, flags, s, stdout, stderr);
        break;
      case "validate":
        exitCode = await runValidate(restPositionals, flags, s, stdout, stderr);
        break;
      case "rates":
        exitCode = await runRates(restPositionals, flags, s, stdout, stderr);
        break;
      case "config":
        exitCode = await runConfig(restPositionals, flags, s, stdout, stderr);
        break;
      case "stress-test":
        exitCode = await runStressTest(restPositionals, flags, stdout, stderr);
        break;
      case "classify":
        exitCode = await runClassify(restPositionals, flags, s, stdout, stderr);
        break;
      default:
        stderr.write(USAGE_LINE);
        exitCode = 2;
    }
  } catch (err) {
    if (err instanceof ClassificationError) {
      stderr.write(err.message + "\n");
      exitCode = 1;
    } else if (err instanceof ParseError) {
      if (err.code === "INVALID_CSV") {
        stderr.write(s.errorInvalidCsv + "\n");
      } else if (err.code === "MISSING_SECTION") {
        stderr.write(s.errorMissingSection(err.sectionName!) + "\n");
      } else {
        stderr.write(s.errorMissingColumn(err.columnName!) + "\n");
      }
      exitCode = 1;
    } else if (err instanceof CalculationError) {
      // NO_OPEN_LOTS is the only CalculationError code this shared handler
      // renders today; AMBIGUOUS_TAX_YEAR (v0.11.2) is caught and rendered
      // via errorAmbiguousTaxYear at the calc command's own call site
      // (Task 53), so it never reaches here today. .isin!/.date! mirror the
      // ParseError.sectionName!/.columnName! non-null-assertion pattern used
      // just above: TS can't correlate an optional sibling field to a
      // literal-typed .code check on a plain class, so the guard establishes
      // the invariant and the assertion documents it, same as ParseError.
      if (err.code === "NO_OPEN_LOTS") {
        stderr.write(s.errorNoOpenLots(err.isin!, err.date!) + "\n");
      }
      exitCode = 1;
    } else {
      throw err;
    }
  }

  return exitCode;
}

async function main(): Promise<void> {
  const exitCode = await runCli(
    process.argv.slice(2),
    process.stdout,
    process.stderr,
  );
  process.exit(exitCode);
}

const isMainModule =
  !!process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((err) => {
    process.stderr.write(`Unhandled error: ${String(err)}\n`);
    process.exit(1);
  });
}
