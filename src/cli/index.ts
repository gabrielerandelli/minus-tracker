import { parseArgs } from "node:util";
import { resolveLocale, getStrings } from "../i18n/index.js";
import { ParseError, CalculationError } from "../errors.js";
import { runCalc } from "./commands/calc.js";
import { runValidate } from "./commands/validate.js";
import { runRates } from "./commands/rates.js";
import { runConfig } from "./commands/config.js";

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      lang: { type: "string" },
      method: { type: "string" },
      year: { type: "string" },
      json: { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      update: { type: "boolean", default: false },
      show: { type: "boolean", default: false },
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

  const stdout = process.stdout;
  const stderr = process.stderr;

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
      default:
        stderr.write(
          "Usage: minus-tracker <calc|validate|rates|config> [options] [file]\n",
        );
        exitCode = 2;
    }
  } catch (err) {
    if (err instanceof ParseError) {
      if (err.code === "INVALID_CSV") {
        stderr.write(s.errorInvalidCsv + "\n");
      } else {
        stderr.write(s.errorMissingColumn(err.columnName!) + "\n");
      }
      exitCode = 1;
    } else if (err instanceof CalculationError) {
      stderr.write(s.errorNoOpenLots(err.isin, err.date) + "\n");
      exitCode = 1;
    } else {
      throw err;
    }
  }

  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(`Unhandled error: ${String(err)}\n`);
  process.exit(1);
});
