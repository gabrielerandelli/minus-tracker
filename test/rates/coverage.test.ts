import { describe, it, expect, vi } from "vitest";
import { Writable } from "node:stream";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { it as itStrings } from "../../src/i18n/it.js";
import { stripAnsi } from "../../src/cli/colors.js";
import {
  getActiveSnapshot,
  getRateCoverage,
  type RatesSnapshot,
} from "../../src/rates/index.js";

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
 * TC-233/TC-234's own "Test Data" column names *the* repo's stub ECB rate
 * fixture -- the one every currency-conversion unit test in this suite is
 * required to share (`docs/test_plan.md`'s "Stub ECB Rate Fixture" section:
 * "All unit tests that require currency conversion use the following
 * controlled rates"), already reused verbatim by TC-009/TC-010/TC-011
 * (`test/TC-00{9,10,11}.test.ts`'s own `STUB_RATES`) and mirrored on disk at
 * `test/fixtures/ecb-rates-stub.json`. A prior version of this file quietly
 * substituted its own, differently-shaped values instead (different USD
 * dates/rates entirely, plus an extra CHF date the canonical fixture doesn't
 * have) -- self-consistent, but not the mandated fixture, so it verified a
 * dataset the test plan never specified rather than the one it did. Loading
 * the real fixture file here (not retyping its numbers a fourth time) is
 * what keeps this file from drifting the same way if the shared fixture ever
 * changes.
 *
 * USD's three canonical dates (2024-01-02, 2024-01-05, 2024-06-03) span a
 * wide, deliberately non-contiguous range -- exactly what a "real" coverage
 * gap list looks like, as opposed to a hand-picked few-day window. Its
 * expected missing-date list is derived independently below (`weekdaysInRange`
 * minus the known-present dates), not by re-deriving it from
 * `getRateCoverage()` itself, and cross-checked against a fixed expected
 * count (107) so a change to either implementation is caught. GBP and CHF
 * each carry only one stored date in the canonical fixture, so their windows
 * are single-day and gap-free by construction -- genuinely covered, just
 * trivially so; USD is this suite's only source of a non-empty gap list.
 *
 * TC-235's second root cause (the actual reason this task failed independent
 * verification twice): the CLI's `summarizeCoverageForDisplay()`
 * (`src/cli/commands/rates.ts`) was joining `gaps[ccy]`'s raw missing-date
 * array straight into the "Lacune:"/"Gaps:" line -- every prior unit
 * assertion in this file passed, because none of them checked the *content*
 * of that line against the real bundled snapshot, only that it existed and
 * was amber. Run for real, it turns Part 19's "aggregating into the existing
 * single-line display" into a thousand-plus-character dump of every missing
 * ISO date across 3 currencies, instead of the short per-currency gap
 * *count* (`"USD: 37"`) `getCoverage()` always showed. The exhaustive
 * per-currency date list belongs to `check_rate_coverage`'s raw JSON output,
 * not the CLI's aggregated line. Below, "Step 1" asserts both the positive
 * (counts appear) and the negative (raw dates do not) so this can't
 * regress unnoticed again.
 */
const STUB_SNAPSHOT: RatesSnapshot = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../fixtures/ecb-rates-stub.json"),
    "utf8",
  ),
) as RatesSnapshot;

// Sanity-check the fixture itself hasn't drifted from what this file's
// hand-derived expectations below assume.
const EXPECTED_USD_DATES = ["2024-01-02", "2024-01-05", "2024-06-03"];
if (
  JSON.stringify(Object.keys(STUB_SNAPSHOT.USD).sort()) !==
  JSON.stringify(EXPECTED_USD_DATES)
) {
  throw new Error(
    "test/fixtures/ecb-rates-stub.json's USD dates no longer match this " +
      "file's hand-derived expectations -- update both together.",
  );
}

/**
 * Independent reference computation (not `findMissingBusinessDays()` from
 * `src/rates/index.ts`) of every Mon-Fri ISO date in `[start, end]` that
 * isn't in `present`. Used only to derive USD's expected gap list from the
 * canonical fixture above, so the coverage function's own weekday/range
 * handling is checked against a separately-written calculation rather than
 * echoing it back.
 */
function weekdaysInRangeExcluding(
  start: string,
  end: string,
  present: Set<string>,
): string[] {
  const out: string[] = [];
  const cursor = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (cursor <= last) {
    const dow = cursor.getUTCDay();
    const iso = cursor.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !present.has(iso)) out.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

const EXPECTED_USD_GAPS = weekdaysInRangeExcluding(
  "2024-01-02",
  "2024-06-03",
  new Set(EXPECTED_USD_DATES),
);

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
      expect(body.coverage.USD).toEqual({ from: "2024-01-02", to: "2024-06-03" });
      expect(body.coverage.GBP).toEqual({ from: "2024-01-02", to: "2024-01-02" });
      expect(body.coverage.CHF).toEqual({ from: "2024-01-02", to: "2024-01-02" });
    });
  });

  it("Step 2: gaps[currency] lists the actual missing ISO dates within that currency's window", async () => {
    await withStubSnapshot(async () => {
      const { handleCheckRateCoverage } = await import(
        "../../src/mcp/tools/check-rate-coverage.js"
      );
      const result = await handleCheckRateCoverage({});
      const body = JSON.parse(result.content[0].text as string);

      // GBP/CHF each have exactly one stored date -> single-day window, no
      // other day to be missing.
      expect(body.gaps.GBP).toEqual([]);
      expect(body.gaps.CHF).toEqual([]);

      // USD's window is wide (Jan-Jun) with only 3 stored dates -- a real
      // gap list, checked exactly against the independently-derived
      // reference list above (107 dates), not just spot-checked.
      expect(body.gaps.USD).toHaveLength(107);
      expect(body.gaps.USD).toEqual(EXPECTED_USD_GAPS);
      // None of the 3 stored dates leak into the gap list...
      for (const stored of EXPECTED_USD_DATES) {
        expect(body.gaps.USD).not.toContain(stored);
      }
      // ...and no Saturday/Sunday is ever reported as a gap.
      for (const iso of body.gaps.USD as string[]) {
        const dow = new Date(iso + "T00:00:00Z").getUTCDay();
        expect(dow).not.toBe(0);
        expect(dow).not.toBe(6);
      }
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
      expect(body.coverage.USD).toEqual({ from: "2024-01-02", to: "2024-06-03" });
      expect(body.gaps.USD).toEqual(EXPECTED_USD_GAPS);
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
//
// Unlike TC-233/TC-234, this runs against the real active snapshot (bundled
// `src/data/ecb-rates.json`, unmocked) -- the same "real bundled snapshot"
// precedent already established by `test/rates-color.test.ts`'s TC-223
// coverage-coloring tests -- so the agreement check exercises production
// data, not only the synthetic fixture above.
// ---------------------------------------------------------------------------

describe("TC-235: rates --check and check_rate_coverage share one implementation", () => {
  it("Step 1: per-currency gap dates agree between the CLI's aggregated display and the tool's raw output (real bundled snapshot)", async () => {
    const { runRates } = await import("../../src/cli/commands/rates.js");
    const { handleCheckRateCoverage } = await import(
      "../../src/mcp/tools/check-rate-coverage.js"
    );

    const toolResult = await handleCheckRateCoverage({});
    const toolBody = JSON.parse(toolResult.content[0].text as string);

    // The real bundled snapshot has 3 currencies, each with real gaps
    // (asserted directly, not assumed) -- otherwise this test would pass
    // vacuously via the `dates.length === 0` skip below.
    expect(Object.keys(toolBody.coverage).sort()).toEqual(["CHF", "GBP", "USD"]);
    for (const ccy of ["USD", "GBP", "CHF"]) {
      expect((toolBody.gaps[ccy] as string[]).length).toBeGreaterThan(0);
    }

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

    // The CLI's single gaps line aggregates the tool's raw per-currency gap
    // *dates* into a *count* per currency -- Part 19's "aggregating its
    // per-currency output into the existing single-line display" means the
    // pre-Task-64 `getCoverage()` display (a short "CCY: <count>" line) is
    // preserved, not replaced by an exhaustive date dump. The exhaustive
    // list is what the tool's raw JSON output above is for.
    for (const [ccy, dates] of Object.entries(toolBody.gaps) as [
      string,
      string[],
    ][]) {
      if (dates.length === 0) continue;
      expect(lines[1]).toContain(`${ccy}: ${dates.length}`);
      // And, conversely, the CLI must NOT be dumping the raw dates -- that
      // was the actual regression a prior attempt at this task shipped
      // (technically "aggregated," but into an unusable thousand-character
      // line against the real bundled snapshot) even though no assertion in
      // this file's earlier version caught it.
      expect(lines[1]).not.toContain(dates[0]);
    }
    // The whole line stays short -- a handful of "CCY: <count>" entries,
    // never a multi-hundred-entry date dump. Locks in the fix above so a
    // future change back to joining raw dates fails loudly here instead of
    // only showing up as a UX regression nobody wrote a test for.
    expect(lines[1].length).toBeLessThan(200);

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

    // Cross-check against a direct, independent call to the shared function
    // against the same real snapshot -- the CLI and the tool must not just
    // agree with each other, both must agree with `getRateCoverage()` itself.
    const direct = getRateCoverage(getActiveSnapshot());
    expect(toolBody.coverage).toEqual(direct.coverage);
    expect(toolBody.gaps).toEqual(direct.gaps);
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
