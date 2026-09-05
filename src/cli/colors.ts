/**
 * Shared terminal color helpers (v0.12.0, Part 18 "CLI Color Output").
 *
 * Extracted from `banner.ts` (`ansiTrueColor`/`RESET`/`stripAnsi` move here verbatim; the
 * banner's gradient-lerp math stays in `banner.ts` since it remains the only caller). No new
 * runtime dependency — same hand-rolled-ANSI approach as the banner, per `AGENTS.md`'s
 * zero-dependency convention.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const RESET = "\x1b[0m";
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

export function ansiTrueColor(rgb: RGB): string {
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m`;
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace(/^#/, "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/** Wraps `text` in the given hex color when `enabled`; returns `text` unchanged otherwise. */
export function colorize(text: string, hex: string, enabled: boolean): string {
  if (!enabled) return text;
  return ansiTrueColor(hexToRgb(hex)) + text + RESET;
}

/** One colorable piece of a rendered line/row. No `hex` means unstyled/navy-neutral text. */
export interface Segment {
  text: string;
  hex?: string;
}

/**
 * Joins segment texts, coloring each individually when it carries a `hex`. Callers are
 * responsible for baking their own separators/padding into each `segment.text` *before* calling
 * this — padding must always be computed on the plain string first (the padding-before-color
 * invariant), never on a string that already carries ANSI escape bytes.
 */
export function renderSegments(segments: Segment[], enabled: boolean): string {
  return segments
    .map((seg) => (seg.hex ? colorize(seg.text, seg.hex, enabled) : seg.text))
    .join("");
}
