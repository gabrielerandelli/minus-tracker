import { it } from "./it.js";
import { en } from "./en.js";
import type { LocaleStrings, SupportedLocale } from "./types.js";

export { it, en };
export type { LocaleStrings, SupportedLocale };
export type { MinusTrackerConfig } from "./types.js";
export {
  resolveLocale,
  saveLocale,
  readConfig,
  getConfigPath,
} from "./settings.js";

export function getStrings(locale: SupportedLocale): LocaleStrings {
  return locale === "it" ? it : en;
}
