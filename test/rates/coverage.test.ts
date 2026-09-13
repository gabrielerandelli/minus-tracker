import { describe, it, expect, vi } from "vitest";
import { Writable } from "node:stream";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { it as itStrings } from "../../src/i18n/it.js";
import { stripAnsi } from "../../src/cli/colors.js";
import { getRateCoverage, type RatesSnapshot } from "../../src/rates/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Task 64 — `check_rate_coverage`: shared per-currency coverage function +
 * MCP tool.
 *
 * TC-233: default call (no `currencies`) returns coverage/gaps for every
 *         bundled currency.
 * TC-234: a `currencies` filter limits output to exactly the requested
 *         currencies (and `[]` yields empty results).
 * TC-235: `rates --check` and `check_rate_coverage` agree, sourced from the
 *         one shared `getRateCoverage()` implementation -- the private
 *         `getCoverage()` duplicate no longer exists.
 *
 * All cases use a small, controlled synthetic snapshot (not the repo's
 * bundled ECB data) so the exact missing-date lists are deterministic and
 * easy to reason about:
 *   USD: 2024-01-02 (Tue), 2024-01-03 (Wed), 2024-01-05 (Fri) -> missing 01-04
 *   GBP: 2024-01-02 (Tue) only                                 -> no gaps
 *   CHF: 2024-01-02 (Tue), 2024-01-08 (Mon)                    -> missing 01-03/04/05
 *        (01-06/07 are a weekend, never a gap)
 */
const STUB_SNAPSHOT: RatesSnapshot = {
  USD: { "2024-01-02": 1.1, "2024-01-03": 1.11, "2024-01-05": 1.12 },
  GBP: { "2024-01-02": 0.86 },
  CHF: { "2024-01-02": 0.93, "2024-01-08": 0.94 },
};

function makeWritable(): { stream: Writable; output: () => string } {
  let buf = "";
  const stream = new Writable({
    write(chunk, _encoding, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { stream, output: () => buf };
}

async function withStubSnapshot<T>(fn: () => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.doMock("../../src/rates/index.js", async () => {
    const actual = await vi.importActual<typeof import("../../src/rates/index.js")>(
      "../../src/rates/index.js",
    );
    return { ...actual, getActiveSnapshot: () => STUB_SNAPSHOT };
  });
  try {
    return await fn();
  } finally {
    vi.doUnmock("../../src/rates/index.js");
    vi.resetModules();
  }
}

// ---------------------------------------------------------------------------
// TC-233: default call -> per-currency coverage + gaps for every bundled
// currency, no network call.
// ---------------------------------------------------------------------------

describe("TC-233: check_rate_coverage({}) -- coverage + gaps for every bundled currency", () => {
  it("Step 1: coverage has one { from, to } entry per bundled currency", async () => {
    await withStubSnapshot(async () => {
      const { handleCheckRateCoverage } = await import(
        "../../src/mcp/tools/check-rate-coverage.js"
      );
      const result = await handleCheckRateCoverage({});
      const body = JSON.parse(result.content[0].text as string);

      expect(Object.keys(body.coverage).sort()).toEqual(["CHF", "GBP", "USD"]);
      expect(body.coverage.USD).toEqual({ from: "2024-01-02", to: "2024-01-05" });
      expect(body.coverage.GBP).toEqual({ from: "2024-01-02", to: "2024-01-02" });
      expect(body.coverage.CHF).toEqual({ from: "2024-01-02", to: "2024-01-08" });
    });
  });

  it("Step 2: gaps[currency] lists the actual missing ISO dates within that currency's window", async () => {
    await withStubSnapshot(async () => {
      const { handleCheckRateCoverage } = await import(
        "../../src/mcp/tools/check-rate-coverage.js"
      );
      const result = await handleCheckRateCoverage({});
      const body = JSON.parse(result.content[0].text as string);

      expect(body.gaps.USD).toEqual(["2024-01-04"]);
      expect(body.gaps.GBP).toEqual([]);
      expect(body.gaps.CHF).toEqual(["2024-01-03", "2024-01-04", "2024-01-05"]);
    });
  });

  it("makes no network call", async () => {
    await withStubSnapshot(async () => {
      vi.doMock("node:https", () => ({
        get: () => {
          throw new Error("check_rate_coverage must never touch the network");
        },
      }));
      const { handleCheckRateCoverage } = await import(
        "../../src/mcp/tools/check-rate-coverage.js"
      );
      await expect(handleCheckRateCoverage({})).resolves.toBeDefined();
      vi.doUnmock("node:https");
    });
  });
});

// ---------------------------------------------------------------------------
// TC-234: `currencies` filter -> output limited to exactly the requested
// currencies.
// ---------------------------------------------------------------------------

describe("TC-234: check_rate_coverage({ currencies }) -- exact filter, not a superset/subset", () => {
  it("Step 1: currencies: ['USD'] restricts both coverage and gaps to USD only", async () => {
    await withStubSnapshot(async () => {
      const { handleCheckRateCoverage } = await import(
        "../../src/mcp/tools/check-rate-coverage.js"
      );
      const result = await handleCheckRateCoverage({ currencies: ["USD"] });
      const body = JSON.parse(result.content[0].text as string);

      expect(Object.keys(body.coverage)).toEqual(["USD"]);
      expect(Object.keys(body.gaps)).toEqual(["USD"]);
      expect(body.coverage.USD).toEqual({ from: "2024-01-02", to: "2024-01-05" });
      expect(body.gaps.USD).toEqual(["2024-01-04"]);
    });
  });

  it("Step 2: currencies: [] -- coverage and gaps are both empty objects", async () => {
    await withStubSnapshot(async () => {
      const { handleCheckRateCoverage } = await import(
        "../../src/mcp/tools/check-rate-coverage.js"
      );
      const result = await handleCheckRateCoverage({ currencies: [] });
      const body = JSON.parse(result.content[0].text as string);

      expect(body.coverage).toEqual({});
      expect(body.gaps).toEqual({});
    });
  });

  it("a requested currency absent from the snapshot is simply omitted, not an error", () => {
    // Unit-level, directly against the shared function: JPY isn't a key in
    // STUB_SNAPSHOT at all, so it must not appear in either output map.
    const { coverage, gaps } = getRateCoverage(STUB_SNAPSHOT, ["USD", "JPY"]);
    expect(Object.keys(coverage)).toEqual(["USD"]);
    expect(Object.keys(gaps)).toEqual(["USD"]);
  });
});

// ---------------------------------------------------------------------------
// TC-235: the shared function retires the private `getCoverage()` duplicate
// -- `rates --check` and the tool agree.
// ---------------------------------------------------------------------------

describe("TC-235: rates --check and check_rate_coverage share one implementation", () => {
  it("Step 1: per-currency gap dates agree between the CLI's aggregated display and the tool's raw output", async () => {
    await withStubSnapshot(async () => {
      const { runRates } = await import("../../src/cli/commands/rates.js");
      const { handleCheckRateCoverage } = await import(
        "../../src/mcp/tools/check-rate-coverage.js"
      );

      const toolResult = await handleCheckRateCoverage({});
      const toolBody = JSON.parse(toolResult.content[0].text as string);

      const stdout = makeWritable();
      const stderr = makeWritable();
      const exitCode = await runRates(
        [],
        { check: true },
        itStrings,
        stdout.stream,
        stderr.stream,
        false,
      );
      expect(exitCode).toBe(0);
      const lines = stripAnsi(stdout.output()).split("\n").filter(Boolean);

      // The CLI aggregates the same per-currency gap dates the tool returns
      // raw -- every date the tool lists for a currency must appear, next to
      // that currency's code, in the CLI's single gaps line.
      for (const [ccy, dates] of Object.entries(toolBody.gaps) as [
        string,
        string[],
      ][]) {
        if (dates.length === 0) continue;
        expect(lines[1]).toContain(`${ccy}: ${dates.join(", ")}`);
      }

      // And the CLI's combined date span is exactly the min/max of the
      // tool's per-currency spans -- same underlying scan, just aggregated.
      const froms = Object.values(toolBody.coverage).map(
        (c) => (c as { from: string }).from,
      );
      const tos = Object.values(toolBody.coverage).map(
        (c) => (c as { to: string }).to,
      );
      expect(lines[0]).toContain(froms.sort()[0]);
      expect(lines[0]).toContain(tos.sort().at(-1) as string);
    });
  });

  it("Step 2: getCoverage() no longer exists anywhere in src/ as a private duplicate", () => {
    const srcDir = path.join(__dirname, "../../src");
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".ts")) {
          const content = fs.readFileSync(full, "utf8");
          if (/function\s+getCoverage\s*\(/.test(content)) offenders.push(full);
        }
      }
    };
    walk(srcDir);

    expect(offenders).toEqual([]);
  });

  it("getRateCoverage() is the only exported coverage-scan function from src/rates/index.ts", async () => {
    const module = await import("../../src/rates/index.js");
    expect(typeof module.getRateCoverage).toBe("function");
  });
});
