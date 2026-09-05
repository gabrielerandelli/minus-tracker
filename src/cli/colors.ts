/**
 * Shared, hand-rolled ANSI truecolor primitives for the CLI.
 *
 * Extracted from `banner.ts` (v0.10.0) so every command's output — not just the
 * banner — can share the same coloring/stripping helpers. No new runtime
 * dependency: same zero-dependency approach as the banner, per AGENTS.md's
 * "minimal/zero runtime dependencies" convention.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const RESET = "\x1b[0m";

const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

/** Removes ANSI escape sequences. Byte-identical behavior to the pre-extraction `banner.ts` version. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

/** Truecolor (24-bit) foreground escape sequence for `rgb`. Does not include RESET. */
export function ansiTrueColor(rgb: RGB): string {
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m`;
}

/** Parses a `#RRGGBB` (or `RRGGBB`) hex string into an `RGB` triple. */
function hexToRgb(hex: string): RGB {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * Wraps `text` in a truecolor escape derived from `hex` plus the shared RESET when
 * `enabled`; returns `text` unchanged when `!enabled`. This is the one piece of logic
 * genuinely new in this module (not present in `banner.ts` today, which only ever
 * gradients between two hardcoded `RGB` constants via `ansiTrueColor` directly).
 */
export function colorize(text: string, hex: string, enabled: boolean): string {
  if (!enabled) return text;
  return `${ansiTrueColor(hexToRgb(hex))}${text}${RESET}`;
}

/** One piece of a colorable row/line. `hex` omitted (or undefined) renders unstyled. */
export interface Segment {
  text: string;
  hex?: string;
}

/**
 * Joins `segments` into one string, coloring each piece independently.
 *
 * Contract: callers are responsible for their own separators/padding being baked into
 * each `segment.text` *before* calling this — segment texts are joined directly, with
 * no separator inserted. Padding must be computed on the plain (pre-color) text, then
 * baked in, so ANSI escape bytes are never counted toward any width a caller computes
 * (the same padding-before-color invariant `banner.ts`'s `Line { plain, colored }`
 * pattern already follows, generalized to every future table/row renderer).
 */
export function renderSegments(segments: Segment[], enabled: boolean): string {
  return segments
    .map((segment) =>
      segment.hex !== undefined ? colorize(segment.text, segment.hex, enabled) : segment.text,
    )
    .join("");
}
