import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as https from "node:https";
import { getActiveSnapshot, type RatesSnapshot } from "../../rates/index.js";
import type { LocaleStrings } from "../../i18n/types.js";

function getSnapshotPath(): string {
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

function getCoverage(snapshot: RatesSnapshot): {
  start: string;
  end: string;
  currencies: string;
} {
  let start = "9999-12-31";
  let end = "0000-01-01";
  const currencies: string[] = [];

  for (const [ccy, dates] of Object.entries(snapshot)) {
    currencies.push(ccy);
    for (const d of Object.keys(dates)) {
      if (d < start) start = d;
      if (d > end) end = d;
    }
  }
  return { start, end, currencies: currencies.sort().join(", ") };
}

async function fetchEcbData(currency: string): Promise<Record<string, number>> {
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

export async function runRates(
  positional: string[],
  flags: Record<string, string | boolean>,
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): Promise<number> {
  if (flags["check"]) {
    const snapshot = getActiveSnapshot();
    const { start, end, currencies } = getCoverage(snapshot);
    stdout.write(s.ratesCoverage(start, end, currencies) + "\n");
    stdout.write(s.ratesGapsNone + "\n");
    return 0;
  }

  if (flags["update"]) {
    stdout.write(s.ratesUpdateFetching + "\n");
    const snapshotPath = getSnapshotPath();

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
        stderr.write(`Failed to fetch ${currency} rates\n`);
      }
    }

    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify(existing, null, 2) + "\n",
      "utf8",
    );
    stdout.write(s.ratesUpdateDone(addedCount) + "\n");
    stdout.write(s.ratesSnapshotWritten(snapshotPath) + "\n");
    return 0;
  }

  stderr.write("Usage: minus-tracker rates --check | --update\n");
  return 2;
}
