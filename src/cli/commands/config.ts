import { resolveLocale, saveLocale, deleteConfig } from "../../i18n/settings.js";
import type { LocaleStrings, SupportedLocale } from "../../i18n/types.js";

const SUPPORTED_LOCALES: SupportedLocale[] = ["it", "en"];
const USAGE_LINE = "Usage: minus-tracker config --lang <it|en> | --show | --reset\n";

export async function runConfig(
  positional: string[],
  flags: Record<string, string | boolean>,
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): Promise<number> {
  const resetFlag = flags["reset"] === true;

  if (resetFlag && (flags["lang"] !== undefined || flags["show"])) {
    stderr.write(USAGE_LINE);
    return 2;
  }

  if (resetFlag) {
    deleteConfig();
    stdout.write(s.configReset + "\n");
    return 0;
  }

  if (flags["lang"] !== undefined) {
    const lang = flags["lang"] as string;
    if (!SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
      stderr.write(`Unsupported locale "${lang}". Use: it, en\n`);
      return 2;
    }
    saveLocale(lang as SupportedLocale);
    stdout.write(s.configLangSet(lang as SupportedLocale) + "\n");
    return 0;
  }

  if (flags["show"]) {
    const locale = resolveLocale();
    stdout.write(s.configCurrentLang(locale) + "\n");
    return 0;
  }

  stderr.write(USAGE_LINE);
  return 2;
}
