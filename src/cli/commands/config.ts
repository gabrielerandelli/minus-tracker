import { resolveLocale, saveLocale, deleteConfig } from "../../i18n/settings.js";
import type { LocaleStrings, SupportedLocale } from "../../i18n/types.js";
import { renderSegments } from "../colors.js";

const SUPPORTED_LOCALES: SupportedLocale[] = ["it", "en"];
const USAGE_LINE = "Usage: minus-tracker config --lang <it|en> | --show | --reset\n";

// Palette (Part 18): green for state-changing confirmations (a lang was set, config was
// reset), navy for a read-only query (the currently active language). Hard-error
// `stderr.write` calls below (unsupported locale, usage-line fallbacks) are left to Task 63's
// shared red-coloring pass rather than duplicated here, since they're plain `stderr.write`
// calls without a dedicated `LocaleStrings` key today.
const GREEN = "#4ADE80";
const NAVY = "#1B4965";

export async function runConfig(
  positional: string[],
  flags: Record<string, string | boolean>,
  s: LocaleStrings,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  color: boolean = false,
): Promise<number> {
  const resetFlag = flags["reset"] === true;

  if (resetFlag && (flags["lang"] !== undefined || flags["show"])) {
    stderr.write(USAGE_LINE);
    return 2;
  }

  if (resetFlag) {
    deleteConfig();
    stdout.write(renderSegments([{ text: s.configReset, hex: GREEN }], color) + "\n");
    return 0;
  }

  if (flags["lang"] !== undefined) {
    const lang = flags["lang"] as string;
    if (!SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
      stderr.write(`Unsupported locale "${lang}". Use: it, en\n`);
      return 2;
    }
    saveLocale(lang as SupportedLocale);
    stdout.write(
      renderSegments(
        [{ text: s.configLangSet(lang as SupportedLocale), hex: GREEN }],
        color,
      ) + "\n",
    );
    return 0;
  }

  if (flags["show"]) {
    const locale = resolveLocale();
    stdout.write(
      renderSegments([{ text: s.configCurrentLang(locale), hex: NAVY }], color) + "\n",
    );
    return 0;
  }

  stderr.write(USAGE_LINE);
  return 2;
}
