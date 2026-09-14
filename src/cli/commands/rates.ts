import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as https from "node:https";
import {
  getActiveSnapshot,
  getRateCoverage,
  type RatesSnapshot,
} from "../../rates/index.js";
import type { LocaleStrings } from "../../i18n/types.js";
import { renderSegments } from "../colors.js";

// Palette (Part 18): navy for read-only status lines (coverage report, where the snapshot
// was written), green for "clean"/"done" confirmations, amber for gaps and the non-fatal
// per-currency fetch failure, teal for the open-ended "still working" fetch-in-progress line
// (the one stress-test-external use of teal, matching Part 18's semantics).
const NAVY = "#1B4965";
const GREEN = "#4ADE80";
const AMBER = "#FBBF24";
const TEAL = "#2DD4BF";

export function getSnapshotPath(): string {
  const platform = process.platform;
  let configDir: string;
  if (platform === "win32") {
    configDir =
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  } else {
    configDir =
      process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  }
  return path.join(configDir, "minus-tracker", "ecb-rates.json");
}

/**
 * Aggregates the shared per-currency `getRateCoverage()` scan (Task 64) into
 * the single combined start/end + currency list + gap-count display this
 * command has always shown -- retiring the former private, unexported
 * `getCoverage()` duplicate that computed this aggregate shape from its own
 * independent scan. Per-currency gap dates now come from exactly one
 * implementation (this function's own `gaps[ccy].length` and the MCP tool's
 * raw `gaps[ccy]` array are two views of the same `getRateCoverage()` result,
 * so they cannot drift apart -- TC-235), but the CLI's single-line display
 * itself is unchanged from `getCoverage()`'s original shape: a per-currency
 * gap *count* (e.g. "USD: 37"), not the full missing-date list.
 *
 * Showing the full date list here instead of the count is NOT a harmless
 * superset of information -- against the real bundled snapshot (years of
 * coverage across 3 currencies) it turns one short, scannable line into a
 * multi-hundred-entry, thousand-plus-character dump, which is a real CLI UX
 * regression the test suite doesn't happen to assert against. The exhaustive
 * per-currency date list is exactly what `check_rate_coverage`'s raw JSON
 * output is for (Part 19) -- the CLI's aggregated line intentionally stays a
 * count, per Part 19's "aggregating its per-currency output into the
 * *existing* single-line display".
 */
function summarizeCoverageForDisplay(snapshot: RatesSnapshot): {
  start: string;
  end: string;
  currencies: string;
  gaps: string;
} {
  const { coverage, gaps } = getRateCoverage(snapshot);
  const currencyKeys = Object.keys(coverage).sort();

  let start = "9999-12-31";
  let end = "0000-01-01";
  for (const { from, to } of Object.values(coverage)) {
    if (from < start) start = from;
    if (to > end) end = to;
  }

  const gapEntries = currencyKeys
    .filter((ccy) => (gaps[ccy]?.length ?? 0) > 0)
    .map((ccy) => `${ccy}: ${gaps[ccy].length}`);

  return {
    start,
    end,
    currencies: currencyKeys.join(", "),
    gaps: gapEntries.join(", "),
  };
}

export async function fetchEcbData(
  currency: string,
): Promise<Record<string, number>> {
  return new Promise((resolve, reject) => {
    const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.${currency}.EUR.SP00.A?format=csvdata&startPeriod=2019-01-01`;
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const rates: Record<string, number> = {};
          const lines = data.split("\n");
          // ECB SDMX csvdata format:
          // KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,...
          // DATE is column index 6, rate is column index 7
          for (const line of lines) {
            const parts = line.split(",");
            if (parts.length < 8) continue;
            const date = parts[6].trim();
            const rate = parseFloat(parts[7].trim());
            if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(rate) && rate > 0) {
              rates[date] = rate;
            }
          }
          resolve(rates);
        });
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

export async function updateRates(
  snapshotPath: string,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  s: LocaleStrings,
  color: boolean = false,
): Promise<void> {
  stdout.write(
    renderSegments([{ text: s.ratesUpdateFetching, hex: TEAL }], color) + "\n",
  );

  let existing: RatesSnapshot = {};
  try {
    existing = JSON.parse(
      fs.readFileSync(snapshotPath, "utf8"),
    ) as RatesSnapshot;
  } catch {
    /* file doesn't exist yet */
  }

  let addedCount = 0;
  for (const currency of ["USD", "GBP", "CHF"]) {
    try {
      const newRates = await fetchEcbData(currency);
      const existing_ccy = existing[currency] ?? {};
      let added = 0;
      for (const [date, rate] of Object.entries(newRates)) {
        if (!existing_ccy[date]) added++;
        existing_ccy[date] = rate;
      }
      existing[currency] = existing_ccy;
      addedCount += added;
    } catch {
      stderr.write(
        renderSegments(
          [{ text: `Failed to fetch ${currency} rates`, hex: AMBER }],
          color,
        ) + "\n",
      );
    }
  }

  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(existing, null, 2) + "\n",
    "utf8",
  );
  stdout.write(
    renderSegments([{ text: s.ratesUpdateDone(addedCount), hex: GREEN }], color) +
      "\n",
  );
  stdout.write(
    renderSegments(
      [{ text: s.ratesSnapshotWritten(snapshotPath), hex: NAVY }],
      color,
    ) + "\n",
  );
}

export async function runRates(
  positional: string[],
  flags: Record<string, string | boolean>,
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  color: boolean = false,
): Promise<number> {
  if (flags["check"]) {
    const snapshot = getActiveSnapshot();
    const { start, end, currencies, gaps } =
      summarizeCoverageForDisplay(snapshot);
    stdout.write(
      renderSegments(
        [{ text: s.ratesCoverage(start, end, currencies), hex: NAVY }],
        color,
      ) + "\n",
    );
    stdout.write(
      renderSegments(
        [
          gaps
            ? { text: s.ratesGaps(gaps), hex: AMBER }
            : { text: s.ratesGapsNone, hex: GREEN },
        ],
        color,
      ) + "\n",
    );
    return 0;
  }

  if (flags["update"]) {
    await updateRates(getSnapshotPath(), stdout, stderr, s, color);
    return 0;
  }

  stderr.write("Usage: minus-tracker rates --check | --update\n");
  return 2;
}
