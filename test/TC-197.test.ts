import { describe, it, expect } from "vitest";
import { renderSegments, stripAnsi, type Segment } from "../src/cli/colors.js";

/**
 * TC-197: `renderSegments()` padding-before-color invariant
 *
 * Part 18 (CLI Color Output) — Task 56 (Shared Color Infrastructure).
 *
 * ANSI escape bytes must never be counted toward any width a caller computes.
 * Callers pad each segment's plain text *before* building the Segment[] — this test
 * is the concrete regression guard for that contract, independent of any one
 * command's table renderer.
 */

describe("TC-197: renderSegments() padding-before-color invariant", () => {
  it("visible (stripped) width equals the sum of each segment's pre-padded plain length", () => {
    const segments: Segment[] = [
      { text: "ISIN".padEnd(15), hex: "#1B4965" },
      { text: "566.00".padStart(10), hex: "#4ADE80" },
    ];
    const plainWidth = segments.reduce((n, s) => n + s.text.length, 0);
    const rendered = renderSegments(segments, true);
    expect(Array.from(stripAnsi(rendered)).length).toBe(plainWidth);
  });

  it("stripping the colored output recovers exactly the concatenated plain text", () => {
    const segments: Segment[] = [
      { text: "  NET RESULT: ", hex: "#1B4965" },
      { text: "+566.00", hex: "#4ADE80" },
    ];
    const rendered = renderSegments(segments, true);
    expect(stripAnsi(rendered)).toBe(segments.map((s) => s.text).join(""));
  });

  it("disabled color never emits ANSI bytes, so width is trivially plain-text width", () => {
    const segments: Segment[] = [
      { text: "A".padEnd(5), hex: "#1B4965" },
      { text: "B".padStart(5), hex: "#F87171" },
    ];
    const rendered = renderSegments(segments, false);
    expect(rendered).toBe(segments.map((s) => s.text).join(""));
    expect(rendered).not.toMatch(/\x1b\[/);
  });

  it("joins segment texts directly with no inserted separator", () => {
    const segments: Segment[] = [{ text: "foo" }, { text: "bar" }];
    expect(renderSegments(segments, false)).toBe("foobar");
  });
});
