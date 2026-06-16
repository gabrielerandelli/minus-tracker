import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { MinusTrackerConfig, SupportedLocale } from "./types.js";

const SUPPORTED_LOCALES: SupportedLocale[] = ["it", "en"];

export function getConfigPath(): string {
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "minus-tracker", "config.json");
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(xdg, "minus-tracker", "config.json");
}

export function readConfig(): MinusTrackerConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf8");
    return JSON.parse(raw) as MinusTrackerConfig;
  } catch {
    return {};
  }
}

export function saveLocale(lang: SupportedLocale): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existing = readConfig();
  const updated: MinusTrackerConfig = { ...existing, locale: lang };
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
}

export function resolveLocale(cliLang?: string): SupportedLocale {
  // 1. --lang flag
  if (cliLang !== undefined) {
    if (!SUPPORTED_LOCALES.includes(cliLang as SupportedLocale)) {
      process.stderr.write(`Unsupported locale "${cliLang}". Use: it, en\n`);
      process.exit(2);
    }
    return cliLang as SupportedLocale;
  }
  // 2. env var
  const envLang = process.env.MINUS_TRACKER_LANG;
  if (envLang !== undefined) {
    if (!SUPPORTED_LOCALES.includes(envLang as SupportedLocale)) {
      process.stderr.write(`Unsupported locale "${envLang}". Use: it, en\n`);
      process.exit(2);
    }
    return envLang as SupportedLocale;
  }
  // 3. config file
  const config = readConfig();
  if (config.locale && SUPPORTED_LOCALES.includes(config.locale)) {
    return config.locale;
  }
  // 4. default
  return "it";
}
