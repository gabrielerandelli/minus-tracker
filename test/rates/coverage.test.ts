import { describe, it, expect, vi } from "vitest";
import { Writable } from "node:stream";
import {
  getCurrencyCoverage,
  type RatesSnapshot,
} from "../../src/rates/index.js";

/**
 * Task 64 — `check_rate_coverage` shared per-currency coverage function.
 *
 * Covers TC-233, TC-234, TC-235 from docs/prd/19-mcp-server-extensions.md /
 * docs/test_plan.md's Category 25.
 */

// Monday 2024-01-01, Tuesday 2024-01-02, Wednesday 2024-01-03 (deliberately
// absent from USD -> a real, deterministic gap), Thursday 2024-01-04.
const SNAPSHOT: RatesSnapshot = {
  USD: {
    "2024-01-01": 1.1,
    "2024-01-02": 1.11,
    "2024-01-04": 1.12,
  },
  GBP: {
    "2024-01-01": 0.86,
    "2024-01-02": 0.87,
  },
  CHF: {
    "2024-01-01": 0.93,
  },
};

async function mockActiveSnapshot<T>(fn: () => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.doMock("../../src/rates/index.js", async () => {
    const actual = await vi.importActual<typeof import("../../src/rates/index.js")>(
      "../../src/rates/index.js",
    );
    return { ...actual, getActiveSnapshot: () => SNAPSHOT };
  });
  try {
    return await fn();
  } finally {
    vi.doUnmock("../../src/rates/index.js");
    vi.resetModules();
  }
}

describe("TC-233: check_rate_coverage — default call → per-currency coverage + gaps", () => {
  it("getCurrencyCoverage(snapshot) with no filter returns from/to/missing for every currency", () => {
    const result = getCurrencyCoverage(SNAPSHOT);
    expect(Object.keys(result).sort()).toEqual(["CHF", "GBP", "USD"]);
    expect(result.USD).toEqual({
      from: "2024-01-01",
      to: "2024-01-04",
      missing: ["2024-01-03"],
    });
    expect(result.GBP).toEqual({
      from: "2024-01-01",
      to: "2024-01-02",
      missing: [],
    });
    expect(result.CHF).toEqual({
      from: "2024-01-01",
      to: "2024-01-01",
      missing: [],
    });
  });

  it("handleCheckRateCoverage default call returns coverage/gaps for every bundled currency", async () => {
    await mockActiveSnapshot(async () => {
      const { handleCheckRateCoverage } = await import(
        "../../src/mcp/tools/check-rate-coverage.js"
      );
      const result = await handleCheckRateCoverage({});
      const body = JSON.parse(result.content[0].text as string);

      expect(Object.keys(body.coverage).sort()).toEqual(["CHF", "GBP", "USD"]);
      expect(Object.keys(body.gaps).sort()).toEqual(["CHF", "GBP", "USD"]);
      expect(body.coverage.USD).toEqual({ from: "2024-01-01", to: "2024-01-04" });
      expect(body.gaps.USD).toEqual(["2024-01-03"]);
      expect(body.gaps.GBP).toEqual([]);
      expect(body.gaps.CHF).toEqual([]);
    });
  });
});

describe("TC-234: check_rate_coverage — with currencies filter → output limited", () => {
  it("getCurrencyCoverage(snapshot, currencies) only computes the requested currencies", () => {
    const result = getCurrencyCoverage(SNAPSHOT, ["USD"]);
    expect(Object.keys(result)).toEqual(["USD"]);
  });

  it("handleCheckRateCoverage({ currencies }) limits coverage/gaps to exactly those currencies", async () => {
    await mockActiveSnapshot(async () => {
      const { handleCheckRateCoverage } = await import(
        "../../src/mcp/tools/check-rate-coverage.js"
      );
      const result = await handleCheckRateCoverage({ currencies: ["USD", "GBP"] });
      const body = JSON.parse(result.content[0].text as string);

      expect(Object.keys(body.coverage).sort()).toEqual(["GBP", "USD"]);
      expect(Object.keys(body.gaps).sort()).toEqual(["GBP", "USD"]);
      expect(body.coverage.CHF).toBeUndefined();
    });
  });
});

describe("TC-235: shared coverage function retires private getCoverage() duplicate", () => {
  it("rates --check's per-currency gap counts agree exactly with check_rate_coverage's missing-date lists, from the same shared function", async () => {
    await mockActiveSnapshot(async () => {
      const { handleCheckRateCoverage } = await import(
        "../../src/mcp/tools/check-rate-coverage.js"
      );
      const mcpBody = JSON.parse(
        (await handleCheckRateCoverage({})).content[0].text as string,
      ) as { coverage: Record<string, { from: string; to: string }>; gaps: Record<string, string[]> };

      const { runRates } = await import("../../src/cli/commands/rates.js");
      const { it: itStrings } = await import("../../src/i18n/it.js");

      let out = "";
      const stdout = new Writable({
        write(chunk, _enc, cb) {
          out += chunk.toString();
          cb();
        },
      });
      const stderr = new Writable({
        write(_chunk, _enc, cb) {
          cb();
        },
      });
      const exitCode = await runRates([], { check: true }, itStrings, stdout, stderr, false);
      expect(exitCode).toBe(0);

      const gapsLine = out.split("\n").find((l) => l.startsWith("Lacune:")) ?? "";
      const coverageLine = out.split("\n").find((l) => l.startsWith("Copertura:")) ?? "";

      for (const [ccy, missing] of Object.entries(mcpBody.gaps)) {
        if (missing.length > 0) {
          expect(gapsLine).toContain(`${ccy}: ${missing.length}`);
        } else {
          expect(gapsLine).not.toContain(`${ccy}:`);
        }
      }

      // Combined start/end the CLI reports must be the min(from)/max(to)
      // across the same per-currency coverage the MCP tool returned.
      const froms = Object.values(mcpBody.coverage).map((c) => c.from);
      const tos = Object.values(mcpBody.coverage).map((c) => c.to);
      expect(coverageLine).toContain(froms.sort()[0]);
      expect(coverageLine).toContain(tos.sort().slice(-1)[0]);
    });
  });
});
