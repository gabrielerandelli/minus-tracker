import { fileURLToPath } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";

export type RatesSnapshot = Record<string, Record<string, number>>;

// Load the bundled snapshot lazily; returns null if the file is absent (e.g. broken install)
let _bundled: RatesSnapshot | null | undefined = undefined;

function getBundledSnapshot(): RatesSnapshot | null {
  if (_bundled !== undefined) return _bundled;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const bundledPath = path.join(__dirname, "../data/ecb-rates.json");
  try {
    _bundled = JSON.parse(
      fs.readFileSync(bundledPath, "utf8"),
    ) as RatesSnapshot;
  } catch {
    _bundled = null;
  }
  return _bundled;
}

function getUserSnapshot(): RatesSnapshot | null {
  const platform = process.platform;
  let configDir: string;
  if (platform === "win32") {
    configDir =
      process.env.APPDATA ??
      path.join(process.env.USERPROFILE ?? "~", "AppData", "Roaming");
  } else {
    configDir =
      process.env.XDG_CONFIG_HOME ??
      path.join(process.env.HOME ?? "~", ".config");
  }
  const userPath = path.join(configDir, "minus-tracker", "ecb-rates.json");
  try {
    return JSON.parse(fs.readFileSync(userPath, "utf8")) as RatesSnapshot;
  } catch {
    return null;
  }
}

export function getActiveSnapshot(): RatesSnapshot {
  const bundled = getBundledSnapshot();
  const user = getUserSnapshot();
  if (!bundled && !user) {
    throw new Error(
      "No ECB rates snapshot available. Run `minus-tracker rates --update` to fetch rates.",
    );
  }
  if (!bundled) return user!;
  if (!user) return bundled;
  // Merge: user entries override bundled for same date keys
  const merged: RatesSnapshot = {};
  for (const ccy of new Set([...Object.keys(bundled), ...Object.keys(user)])) {
    merged[ccy] = { ...(bundled[ccy] ?? {}), ...(user[ccy] ?? {}) };
  }
  return merged;
}

export function isSnapshotStale(
  snapshot: RatesSnapshot,
  today?: string,
): boolean {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  let maxDate = "0000-01-01";
  for (const dates of Object.values(snapshot)) {
    for (const d of Object.keys(dates)) {
      if (d > maxDate) maxDate = d;
    }
  }
  if (maxDate === "0000-01-01") return true;
  const diffDays =
    (new Date(todayStr).getTime() - new Date(maxDate).getTime()) /
    (1000 * 60 * 60 * 24);
  return diffDays >= 7;
}

function subtractDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Look up ECB rate for a currency on a given date.
 * Returns 1.0 for EUR. Walks back up to 3 calendar days for weekend/holiday gaps.
 * Returns null if not found within the window.
 *
 * @param currency ISO 4217 currency code
 * @param date     YYYY-MM-DD trade date
 * @param snapshot Optional override (used in tests to inject stub data)
 */
export function lookupRate(
  currency: string,
  date: string,
  snapshot?: RatesSnapshot,
): number | null {
  if (currency === "EUR") return 1.0;

  const s = snapshot ?? getActiveSnapshot();
  const currencyRates = s[currency];
  if (!currencyRates) return null; // unsupported currency

  for (let i = 0; i <= 3; i++) {
    const d = i === 0 ? date : subtractDays(date, i);
    if (currencyRates[d] !== undefined) {
      return currencyRates[d];
    }
  }
  return null;
}
