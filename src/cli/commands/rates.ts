import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as https from "node:https";
import { getActiveSnapshot, type RatesSnapshot } from "../../rates/index.js";
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

function countMissingBusinessDays(
  startDate: string,
  endDate: string,
  dates: Record<string, number>,
): number {
  let missing = 0;
  const cursor = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    const iso = cursor.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && dates[iso] === undefined) missing++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return missing;
}

function getCoverage(snapshot: RatesSnapshot): {
  start: string;
  end: string;
  currencies: string;
  gaps: string;
} {
  let start = "9999-12-31";
  let end = "0000-01-01";
  const currencies: string[] = [];
  const gapEntries: string[] = [];

  for (const [ccy, dates] of Object.entries(snapshot)) {
    currencies.push(ccy);
    const keys = Object.keys(dates).sort();
    for (const d of keys) {
      if (d < start) start = d;
      if (d > end) end = d;
    }
    if (keys.length > 0) {
      const missing = countMissingBusinessDays(
        keys[0],
        keys[keys.length - 1],
        dates,
      );
      if (missing > 0) gapEntries.push(`${ccy}: ${missing}`);
    }
  }
  return {
    start,
    end,
    currencies: currencies.sort().join(", "),
    gaps: gapEntries.sort().join(", "),
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
    const { start, end, currencies, gaps } = getCoverage(snapshot);
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
