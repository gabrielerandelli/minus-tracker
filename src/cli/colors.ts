/**
 * Shared terminal-color primitives for the CLI.
 *
 * Extracted from `banner.ts` (v0.10.0) so the rest of the CLI (`calc`, `validate`, `classify`,
 * `rates`, `config`, `stress-test`) can reuse the same hand-rolled truecolor ANSI approach — no
 * new runtime dependency, consistent with this project's minimal/zero-dependency convention.
 *
 * `banner.ts`'s gradient math (`applyGradient`) stays in `banner.ts`; it remains the only caller.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const RESET = "\x1b[0m";
export const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

/** Removes ANSI escape sequences (e.g. truecolor + reset codes) from `text`. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

/** Returns the 24-bit ANSI truecolor foreground escape for `rgb`. */
export function ansiTrueColor(rgb: RGB): string {
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m`;
}

/** Parses a `#RRGGBB` hex string into an `RGB` triple. */
function hexToRgb(hex: string): RGB {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

/**
 * Wraps `text` in a 24-bit ANSI truecolor escape for `hex` plus a trailing reset when `enabled`
 * is `true`; returns `text` completely unchanged when `enabled` is `false`. A pure styling
 * wrapper — never mutates the underlying text.
 */
export function colorize(text: string, hex: string, enabled: boolean): string {
  if (!enabled) return text;
  return `${ansiTrueColor(hexToRgb(hex))}${text}${RESET}`;
}

/** One piece of a rendered row/line: plain text plus an optional color. */
export interface Segment {
  text: string;
  hex?: string;
}

/**
 * Joins `segments` into one string, colorizing each piece independently.
 *
 * Callers are responsible for baking their own separators/padding into each `segment.text`
 * *before* calling this — padding must always be computed on the plain text first, then wrapped
 * in `colorize()` only at the end, so ANSI escape bytes are never counted toward a width
 * calculation (the padding-before-color invariant, generalized from `banner.ts`'s
 * `Array.from(l.plain).length` width rule). A segment with no `hex` is left unstyled even when
 * other segments in the same array are colored and `enabled` is `true`.
 */
export function renderSegments(segments: Segment[], enabled: boolean): string {
  return segments
    .map((segment) =>
      segment.hex ? colorize(segment.text, segment.hex, enabled) : segment.text,
    )
    .join("");
}
