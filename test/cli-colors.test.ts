import { describe, it, expect } from "vitest";
import { colorize, renderSegments, stripAnsi, type Segment } from "../src/cli/colors.js";

describe("colorize — TC-195", () => {
  it("wraps text in a 24-bit ANSI truecolor escape + trailing reset when enabled", () => {
    expect(colorize("+566.00", "#4ADE80", true)).toBe(
      "\x1b[38;2;74;222;128m+566.00\x1b[0m",
    );
  });

  it("returns the text unchanged, byte-for-byte, when disabled", () => {
    expect(colorize("+566.00", "#4ADE80", false)).toBe("+566.00");
  });
});

describe("stripAnsi — TC-196", () => {
  it("removes truecolor escape sequences", () => {
    expect(stripAnsi("\x1b[38;2;27;73;101mA\x1b[0m")).toBe("A");
  });

  it("is a no-op on plain text", () => {
    expect(stripAnsi("plain text")).toBe("plain text");
  });
});

describe("renderSegments — TC-197 (padding-before-color invariant)", () => {
  it("keeps the visible (stripped) width equal to the pre-padded plain width", () => {
    const label = "ISIN".padEnd(14);
    const segments: Segment[] = [{ text: label, hex: "#1B4965" }];
    const rendered = renderSegments(segments, true);
    expect(stripAnsi(rendered).length).toBe(14);
    expect(stripAnsi(rendered)).toBe(label);
  });

  it("equals the plain padded string, with no escape bytes, when disabled", () => {
    const label = "ISIN".padEnd(14);
    const segments: Segment[] = [{ text: label, hex: "#1B4965" }];
    expect(renderSegments(segments, false)).toBe(label);
  });
});

describe("renderSegments — TC-198 (mixed styled/unstyled segments)", () => {
  const segments: Segment[] = [
    { text: "NET RESULT:" },
    { text: " " },
    { text: "+566.00", hex: "#4ADE80" },
  ];

  it("only colors the segment carrying hex; other segments stay unstyled", () => {
    const rendered = renderSegments(segments, true);
    expect(rendered).toContain("NET RESULT: ");
    expect(rendered).not.toContain("\x1b[38;2;27;73;101mNET RESULT:");
    expect(rendered).toContain("\x1b[38;2;74;222;128m+566.00\x1b[0m");
  });

  it("strips to the exact plain concatenation", () => {
    const rendered = renderSegments(segments, true);
    expect(stripAnsi(rendered)).toBe("NET RESULT: +566.00");
  });
});
