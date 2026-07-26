interface RGB {
  r: number;
  g: number;
  b: number;
}

const GRADIENT_START: RGB = { r: 0x1b, g: 0x49, b: 0x65 }; // navy — minus bar
const GRADIENT_END: RGB = { r: 0x4a, g: 0xde, b: 0x80 }; // green — arrowhead
const RESET = "\x1b[0m";
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

const ICON_LINE_1 = "╾╮ ╭─╮  ▲";
const ICON_LINE_2 = " ╰─╯ ╰──┤";
const ICON_COMPACT = "╾╮╭─╮▲";
const WORDMARK = "minus-tracker";

export interface BannerOptions {
  mode: "full" | "compact";
  tagline: string;
  version: string;
  color: boolean;
  width: number | undefined;
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function gradientColorAt(t: number): RGB {
  return {
    r: lerp(GRADIENT_START.r, GRADIENT_END.r, t),
    g: lerp(GRADIENT_START.g, GRADIENT_END.g, t),
    b: lerp(GRADIENT_START.b, GRADIENT_END.b, t),
  };
}

function ansiTrueColor(rgb: RGB): string {
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m`;
}

/** Colors non-space characters left-to-right along the brand gradient. No-op when color=false. */
function applyGradient(text: string, color: boolean): string {
  if (!color) return text;
  const chars = Array.from(text);
  const n = chars.length;
  if (n === 0) return text;
  let out = "";
  for (let i = 0; i < n; i++) {
    const ch = chars[i]!;
    if (ch === " ") {
      out += ch;
      continue;
    }
    const t = n <= 1 ? 0 : i / (n - 1);
    out += ansiTrueColor(gradientColorAt(t)) + ch;
  }
  return out + RESET;
}

interface Line {
  plain: string;
  colored: string;
}

function iconLine(text: string, color: boolean): Line {
  return { plain: text, colored: applyGradient(text, color) };
}

function plainLine(text: string): Line {
  return { plain: text, colored: text };
}

export function renderBanner(opts: BannerOptions): string {
  return opts.mode === "compact" ? renderCompact(opts) : renderFull(opts);
}

function renderCompact(opts: BannerOptions): string {
  const text = `${ICON_COMPACT}  ${WORDMARK} v${opts.version}`;
  return applyGradient(text, opts.color);
}

function renderFull(opts: BannerOptions): string {
  const iconWordmarkLine1 = `${ICON_LINE_1}     ${WORDMARK}`;
  const regimeLine = `Regime Dichiarativo · v${opts.version}`;

  const lines: Line[] = [
    plainLine(""),
    iconLine(`  ${iconWordmarkLine1}`, opts.color),
    iconLine(`  ${ICON_LINE_2}`, opts.color),
    plainLine(""),
    plainLine(`  ${opts.tagline}`),
    plainLine(`  ${regimeLine}`),
    plainLine(""),
  ];

  const innerWidth = Math.max(...lines.map((l) => Array.from(l.plain).length));
  const boxFits = opts.width === undefined || opts.width >= innerWidth + 4;

  if (!boxFits) {
    return lines
      .map((l) => l.colored)
      .filter((l) => stripAnsi(l).trim().length > 0)
      .join("\n");
  }

  const top = `╭${"─".repeat(innerWidth + 2)}╮`;
  const bottom = `╰${"─".repeat(innerWidth + 2)}╯`;
  const body = lines
    .map((l) => {
      const pad = " ".repeat(innerWidth - Array.from(l.plain).length);
      return `│ ${l.colored}${pad} │`;
    })
    .join("\n");

  return `${top}\n${body}\n${bottom}`;
}
