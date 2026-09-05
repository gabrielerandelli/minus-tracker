/**
 * Shared ANSI color helpers for CLI output (Part 18 — CLI Color Output).
 *
 * Presentation-only: every helper here is a no-op string passthrough when
 * `enabled` is false, so stripping color (or never applying it) always
 * reproduces the exact same bytes a caller would have written without this
 * module — the text-preservation invariant the color feature depends on.
 */

const RESET = "\x1b[0m";
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

/** Strips ANSI escape sequences from a string. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace(/^#/, "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function ansiTrueColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Wraps `text` in a 24-bit ANSI true-color escape for `hex` when `enabled`;
 * returns `text` unchanged otherwise (including when `text` is empty).
 *
 * Callers must finish padding/truncating `text` to its final display width
 * BEFORE calling this — the padding-before-color invariant. Wrapping first
 * and padding after would fold ANSI escape bytes into the width math.
 */
export function colorize(text: string, hex: string, enabled: boolean): string {
  if (!enabled || text.length === 0) return text;
  return `${ansiTrueColor(hex)}${text}${RESET}`;
}

/**
 * One colorable piece of a rendered line/row. `hex` omitted (or undefined)
 * means the segment is rendered unstyled regardless of `enabled`.
 */
export interface Segment {
  text: string;
  hex?: string;
}

/**
 * Joins `segments` into one line, coloring each piece independently.
 *
 * `segment.text` must already be at its final width (padded/truncated) —
 * this function only concatenates and colors, it never pads. That keeps the
 * padding-before-color invariant centralized here instead of re-implemented
 * at every call site.
 */
export function renderSegments(segments: Segment[], enabled: boolean): string {
  return segments
    .map((seg) => (seg.hex ? colorize(seg.text, seg.hex, enabled) : seg.text))
    .join("");
}
