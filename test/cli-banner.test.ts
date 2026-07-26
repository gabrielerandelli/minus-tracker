import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { renderBanner, stripAnsi } from "../src/cli/banner.js";
import { runCli } from "../src/cli/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TAGLINE_EN = "Italian Capital Gains & Losses Tracker";
const TAGLINE_IT = "Calcolo Plusvalenze & Minusvalenze";
const VERSION = "0.9.0";

function captureStream(): { stream: Writable; output: () => string } {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { stream, output: () => buf };
}

describe("renderBanner — full mode", () => {
  it("renders without ANSI codes when color is disabled", () => {
    const output = renderBanner({
      mode: "full",
      tagline: TAGLINE_EN,
      version: VERSION,
      color: false,
      width: undefined,
    });
    expect(output).not.toMatch(/\x1b\[/);
    expect(output).toContain("minus-tracker");
    expect(output).toContain(TAGLINE_EN);
    expect(output).toContain(`Regime Dichiarativo · v${VERSION}`);
    expect(output).toContain("╭");
    expect(output).toContain("╰");
  });

  it("applies a truecolor gradient to the icon/wordmark when color is enabled", () => {
    const output = renderBanner({
      mode: "full",
      tagline: TAGLINE_EN,
      version: VERSION,
      color: true,
      width: undefined,
    });
    expect(output).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
    expect(stripAnsi(output)).toContain("minus-tracker");
    // Border/tagline lines are never colorized per design.
    const taglineLine = stripAnsi(output)
      .split("\n")
      .find((l) => l.includes(TAGLINE_EN))!;
    expect(output.split("\n").find((l) => l.includes(TAGLINE_EN))).toBe(
      taglineLine,
    );
  });

  it("produces a rectangular box — every line has equal visual width", () => {
    const output = renderBanner({
      mode: "full",
      tagline: TAGLINE_EN,
      version: VERSION,
      color: false,
      width: undefined,
    });
    const widths = new Set(output.split("\n").map((l) => Array.from(l).length));
    expect(widths.size).toBe(1);
  });

  it("uses the full box when width is undefined (piped/non-TTY)", () => {
    const output = renderBanner({
      mode: "full",
      tagline: TAGLINE_EN,
      version: VERSION,
      color: false,
      width: undefined,
    });
    expect(output).toMatch(/^╭─+╮$/m);
  });

  it("falls back to a borderless layout when narrower than the box", () => {
    const output = renderBanner({
      mode: "full",
      tagline: TAGLINE_EN,
      version: VERSION,
      color: false,
      width: 20,
    });
    // The icon glyph itself legitimately uses ╭/╰ as part of its curve, so
    // assert on the absence of a full border *line*, not on those characters.
    expect(output).not.toMatch(/^╭─+╮$/m);
    expect(output).not.toMatch(/^╰─+╯$/m);
    expect(output).toContain("minus-tracker");
    expect(output).toContain(TAGLINE_EN);
  });

  it("substitutes the localized tagline", () => {
    const output = renderBanner({
      mode: "full",
      tagline: TAGLINE_IT,
      version: VERSION,
      color: false,
      width: undefined,
    });
    expect(output).toContain(TAGLINE_IT);
  });
});

describe("renderBanner — compact mode", () => {
  it("renders a single line with no box", () => {
    const output = renderBanner({
      mode: "compact",
      tagline: TAGLINE_EN,
      version: VERSION,
      color: false,
      width: undefined,
    });
    expect(output.split("\n").length).toBe(1);
    expect(output).toContain(`minus-tracker v${VERSION}`);
    expect(output).not.toMatch(/^╭─+╮$/m);
  });

  it("applies the gradient when color is enabled", () => {
    const output = renderBanner({
      mode: "compact",
      tagline: TAGLINE_EN,
      version: VERSION,
      color: true,
      width: undefined,
    });
    expect(output).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
    expect(stripAnsi(output)).toContain(`minus-tracker v${VERSION}`);
  });
});

describe("stripAnsi", () => {
  it("removes truecolor escape sequences", () => {
    expect(stripAnsi("\x1b[38;2;27;73;101mA\x1b[0m")).toBe("A");
  });

  it("is a no-op on plain text", () => {
    expect(stripAnsi("plain text")).toBe("plain text");
  });
});

describe("runCli — help/version/bare-invocation routing", () => {
  const pkgVersion = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"),
  ).version as string;

  it("--help prints the full banner to stdout and exits 0", async () => {
    const out = captureStream();
    const err = captureStream();
    const code = await runCli(["--help"], out.stream, err.stream);
    expect(code).toBe(0);
    expect(out.output()).toContain("minus-tracker");
    expect(out.output()).toContain("Usage: minus-tracker");
    expect(err.output()).toBe("");
  });

  it("--version prints the compact banner with the package version to stdout and exits 0", async () => {
    const out = captureStream();
    const err = captureStream();
    const code = await runCli(["--version"], out.stream, err.stream);
    expect(code).toBe(0);
    expect(out.output()).toContain(`minus-tracker v${pkgVersion}`);
    expect(err.output()).toBe("");
  });

  it("bare invocation prints the full banner to stderr and exits 2", async () => {
    const out = captureStream();
    const err = captureStream();
    const code = await runCli([], out.stream, err.stream);
    expect(code).toBe(2);
    expect(err.output()).toContain("minus-tracker");
    expect(err.output()).toContain("Usage: minus-tracker");
    expect(out.output()).toBe("");
  });

  it("an unknown command still prints the plain one-line usage (no banner) and exits 2", async () => {
    const out = captureStream();
    const err = captureStream();
    const code = await runCli(["bogus-command"], out.stream, err.stream);
    expect(code).toBe(2);
    expect(err.output()).not.toContain("╭");
    expect(err.output()).toContain("Usage: minus-tracker");
  });

  it("--help takes priority even alongside a real command", async () => {
    const out = captureStream();
    const err = captureStream();
    const code = await runCli(["calc", "--help"], out.stream, err.stream);
    expect(code).toBe(0);
    expect(out.output()).toContain("minus-tracker");
  });

  it("enables the gradient when the stream reports isTTY=true", async () => {
    const out = captureStream();
    (out.stream as unknown as { isTTY: boolean }).isTTY = true;
    const err = captureStream();
    const code = await runCli(["--version"], out.stream, err.stream);
    expect(code).toBe(0);
    expect(out.output()).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/);
  });
});
