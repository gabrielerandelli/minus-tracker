import { describe, it, expect } from "vitest";
import { renderSegments, stripAnsi, type Segment } from "../src/cli/colors.js";

/**
 * TC-198: a `Segment` with no `hex` renders unstyled even inside an otherwise-colored array
 *
 * Part 18 (CLI Color Output) — Task 56 (Shared Color Infrastructure).
 */

describe("TC-198: no-hex Segment stays unstyled inside a colored array", () => {
  it("a segment with hex omitted carries no ANSI escape while its siblings do", () => {
    const segments: Segment[] = [
      { text: "LABEL: ", hex: "#1B4965" },
      { text: "plain-value" },
      { text: " EUR", hex: "#4ADE80" },
    ];
    const rendered = renderSegments(segments, true);

    // The unstyled middle segment appears verbatim, with no escape sequence wrapped
    // directly around it — the colored siblings' own RESET/escape bytes border it,
    // but "plain-value" itself is not re-escaped.
    expect(rendered).toBe(
      "\x1b[38;2;27;73;101mLABEL: \x1b[0m" +
        "plain-value" +
        "\x1b[38;2;74;222;128m EUR\x1b[0m",
    );
  });

  it("stripped output is unaffected regardless of which segments carry hex", () => {
    const segments: Segment[] = [
      { text: "LABEL: ", hex: "#1B4965" },
      { text: "plain-value" },
      { text: " EUR", hex: "#4ADE80" },
    ];
    const rendered = renderSegments(segments, true);
    expect(stripAnsi(rendered)).toBe("LABEL: plain-value EUR");
  });

  it("hex: undefined is treated identically to hex omitted", () => {
    const withOmitted = renderSegments([{ text: "x" }], true);
    const withUndefined = renderSegments([{ text: "x", hex: undefined }], true);
    expect(withOmitted).toBe("x");
    expect(withUndefined).toBe("x");
  });

  it("a fully unstyled array (no segment has hex) equals plain concatenation even when enabled=true", () => {
    const segments: Segment[] = [{ text: "a" }, { text: "b" }, { text: "c" }];
    expect(renderSegments(segments, true)).toBe("abc");
  });
});
