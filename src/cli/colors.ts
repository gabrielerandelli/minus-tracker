/**
 * Shared CLI color infrastructure (Part 18 — CLI Color Output).
 *
 * Hand-rolled 24-bit ANSI truecolor helpers plus a small `Segment`/
 * `renderSegments()` primitive that lets a renderer build mixed-styled rows
 * (e.g. an unstyled label next to a colored value) without hardcoding escape
 * sequences at every call site. No new runtime dependency, per AGENTS.md's
 * minimal/zero-dependency convention.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const RESET = "\x1b[0m";
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

/** Strips ANSI escape sequences from `text`. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

/** Returns the 24-bit ANSI truecolor foreground escape for `rgb`. */
export function ansiTrueColor(rgb: RGB): string {
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m`;
}

/** Parses a `#RRGGBB` hex string into an `RGB` triple. */
function hexToRgb(hex: string): RGB {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * Wraps `text` in a 24-bit ANSI truecolor escape for `hex` plus a trailing
 * reset when `enabled` is true; returns `text` unchanged when `enabled` is
 * false. Never mutates the underlying text.
 */
export function colorize(text: string, hex: string, enabled: boolean): string {
  if (!enabled) return text;
  return `${ansiTrueColor(hexToRgb(hex))}${text}${RESET}`;
}

/** One piece of a rendered row/line: plain text, optionally colored. */
export interface Segment {
  text: string;
  hex?: string;
}

/**
 * Joins `segments` into a single string. Each segment's `text` is expected
 * to already be padded/separated as needed by the caller — this function
 * never counts or adjusts width, it only colors. A segment with no `hex`
 * renders unstyled even inside an otherwise-colored row, which is what makes
 * value-only coloring (label unstyled, value colored) possible.
 */
export function renderSegments(segments: Segment[], enabled: boolean): string {
  return segments
    .map((seg) =>
      seg.hex !== undefined ? colorize(seg.text, seg.hex, enabled) : seg.text,
    )
    .join("");
}
