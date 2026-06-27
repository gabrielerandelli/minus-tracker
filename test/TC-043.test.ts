/**
 * TC-043: Stress Test Suite — Unit Tests
 *
 * Tests for the three pure stress-test modules:
 *   - generator.ts (generateCsv)
 *   - reporter.ts (buildReport, formatTable, formatJson)
 *   - stress-manifest.json (structural integrity)
 *
 * runner.ts is excluded (spawns child processes — integration-only).
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import { generateCsv } from "../src/stress/generator.js";
import type { ManifestScenario } from "../src/stress/generator.js";
import {
  buildReport,
  formatTable,
  formatJson,
} from "../src/stress/reporter.js";
import type { StressReport } from "../src/stress/reporter.js";
import type { ScenarioResult } from "../src/stress/runner.js";

// ---------------------------------------------------------------------------
// Manifest (read once)
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(__dirname, "../src/data/stress-manifest.json"), "utf8"),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_SCENARIO: ManifestScenario = {
  id: "001",
  category: "01-eur-gains",
  slug: "test-gain",
  description: "Test EUR gain",
  transactions: [
    {
      date: "2024-01-02",
      product: "Test Corp",
      isin: "IT0000000001",
      qty: 10,
      price: 100.0,
      currency: "EUR",
      fee: 2.0,
    },
    {
      date: "2024-03-01",
      product: "Test Corp",
      isin: "IT0000000001",
      qty: -10,
      price: 150.0,
      currency: "EUR",
      fee: 2.0,
    },
  ],
  expect: {
    calc_exit: 0,
    fifo_exit: 0,
    json_exit: 0,
    en_exit: 0,
    validate_exit: 0,
    warning_count: 0,
  },
};

function makePass(id: string): ScenarioResult {
  return {
    id,
    category: "01-eur-gains",
    slug: "test",
    description: "Test",
    csvFile: "/tmp/test.csv",
    results: [
      {
        cmd: "calc",
        exitCode: 0,
        stdout: "plusvalenze",
        stderr: "",
        pass: true,
      },
    ],
    pass: true,
    warningCheckPass: true,
    actualWarningCount: 0,
    expectedWarningCount: 0,
  };
}

function makeFail(id: string): ScenarioResult {
  return {
    id,
    category: "11-errors",
    slug: "fail",
    description: "Failure test",
    csvFile: "/tmp/fail.csv",
    results: [
      {
        cmd: "calc",
        exitCode: 0,
        stdout: "",
        stderr: "",
        pass: false,
        failure: "expected exit 1, got exit 0",
      },
    ],
    pass: false,
    warningCheckPass: true,
    actualWarningCount: 0,
    expectedWarningCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Test Group 1: Generator — generateCsv
// ---------------------------------------------------------------------------

describe("TC-043-G1: generateCsv", () => {
  const EXPECTED_HEADER =
    "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";

  it("returns a string starting with the exact CSV header", () => {
    const csv = generateCsv(BASE_SCENARIO);
    expect(csv.split("\n")[0]).toBe(EXPECTED_HEADER);
  });

  it("produces correct number of rows (header + N transactions)", () => {
    const csv = generateCsv(BASE_SCENARIO);
    const lines = csv.split("\n");
    // 1 header + 2 data rows = 3 lines
    expect(lines).toHaveLength(3);
  });

  it("converts date format from YYYY-MM-DD to DD-MM-YYYY", () => {
    const csv = generateCsv(BASE_SCENARIO);
    // BUY row: date 2024-01-02 → 02-01-2024
    expect(csv).toContain("02-01-2024");
  });

  it("sets BUY local value to negative (qty=10, price=100 → -1000.00)", () => {
    const csv = generateCsv(BASE_SCENARIO);
    const lines = csv.split("\n");
    // BUY row is the first data row (index 1)
    expect(lines[1]).toContain("-1000.00");
  });

  it("sets SELL local value to positive (qty=-10, price=150 → 1500.00)", () => {
    const csv = generateCsv(BASE_SCENARIO);
    const lines = csv.split("\n");
    // SELL row is the second data row (index 2)
    const sellRow = lines[2];
    expect(sellRow).toContain("1500.00");
    expect(sellRow).not.toContain("-1500.00");
  });

  it("invalid_csv special: returns non-CSV garbage content", () => {
    const scenario: ManifestScenario = {
      ...BASE_SCENARIO,
      special: "invalid_csv",
      transactions: [],
    };
    const csv = generateCsv(scenario);
    expect(csv.startsWith("Date,")).toBe(false);
  });

  it("missing_col_isin special: header has no ISIN column", () => {
    const scenario: ManifestScenario = {
      ...BASE_SCENARIO,
      special: "missing_col_isin",
    };
    const csv = generateCsv(scenario);
    const header = csv.split("\n")[0];
    expect(header).not.toContain("ISIN");
  });

  it("missing_col_quantity special: header has no Quantity column", () => {
    const scenario: ManifestScenario = {
      ...BASE_SCENARIO,
      special: "missing_col_quantity",
    };
    const csv = generateCsv(scenario);
    const header = csv.split("\n")[0];
    expect(header).not.toContain("Quantity");
  });
});

// ---------------------------------------------------------------------------
// Test Group 2: Reporter — buildReport, formatTable, formatJson
// ---------------------------------------------------------------------------

describe("TC-043-G2: Reporter", () => {
  const passResults = [makePass("001"), makePass("002"), makePass("003")];
  const failResult = makeFail("004");
  const allResults = [...passResults, failResult];
  const report: StressReport = buildReport(allResults, 1, 25);

  it("buildReport aggregates passed/failed counts correctly", () => {
    expect(report.totalScenarios).toBe(4);
    expect(report.passed).toBe(3);
    expect(report.failed).toBe(1);
  });

  it("buildReport sets rangeStart and rangeEnd from parameters", () => {
    expect(report.rangeStart).toBe(1);
    expect(report.rangeEnd).toBe(25);
  });

  it("formatTable contains STRESS TEST header", () => {
    const table = formatTable(report);
    expect(table).toContain("STRESS TEST");
  });

  it("formatTable shows scenario ID in output", () => {
    const table = formatTable(report);
    expect(table).toContain("001");
  });

  it("formatTable shows ✓ PASS for passing scenario", () => {
    const table = formatTable(report);
    expect(table).toContain("✓ PASS");
  });

  it("formatTable shows ✗ FAIL for failing scenario", () => {
    const table = formatTable(report);
    expect(table).toContain("✗ FAIL");
  });

  it("formatTable shows failure detail for failed command", () => {
    const table = formatTable(report);
    expect(table).toContain("expected exit 1, got exit 0");
  });

  it("formatJson returns valid parseable JSON with required keys", () => {
    const json = formatJson(report);
    const parsed = JSON.parse(json);
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
    expect("totalScenarios" in parsed).toBe(true);
    expect("passed" in parsed).toBe(true);
    expect("failed" in parsed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test Group 3: Manifest Integrity
// ---------------------------------------------------------------------------

describe("TC-043-G3: Manifest Integrity", () => {
  const scenarios: ManifestScenario[] = manifest.scenarios;

  it("manifest has exactly 100 scenarios", () => {
    expect(scenarios).toHaveLength(100);
  });

  it("all scenario IDs are unique zero-padded 3-digit strings 001–100", () => {
    const ids = scenarios.map((s) => s.id);
    // All IDs are strings matching /^\d{3}$/
    const allMatch = ids.every((id) => /^\d{3}$/.test(id));
    expect(allMatch).toBe(true);
    // All IDs are unique
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(100);
  });

  it("all scenarios have the required expect fields", () => {
    const requiredFields = [
      "calc_exit",
      "fifo_exit",
      "json_exit",
      "en_exit",
      "validate_exit",
      "warning_count",
    ];
    for (const s of scenarios) {
      for (const field of requiredFields) {
        expect(
          field in s.expect,
          `scenario ${s.id} missing expect.${field}`,
        ).toBe(true);
      }
    }
  });

  it("error scenarios 081 and 082 have validate_exit:0 (SELL-without-BUY)", () => {
    const s081 = scenarios.find((s) => s.id === "081");
    const s082 = scenarios.find((s) => s.id === "082");
    expect(s081).toBeDefined();
    expect(s082).toBeDefined();
    expect(s081!.expect.validate_exit).toBe(0);
    expect(s082!.expect.validate_exit).toBe(0);
  });

  it("warning scenarios (cat 10) all have warning_count >= 1", () => {
    const cat10 = scenarios.filter((s) => s.category.startsWith("10-"));
    expect(cat10.length).toBeGreaterThan(0);
    const allHaveWarnings = cat10.every((s) => s.expect.warning_count >= 1);
    expect(allHaveWarnings).toBe(true);
  });

  it("normal scenarios (cat 01-09, 12-13) all have all exits = 0", () => {
    const normal = scenarios.filter(
      (s) =>
        s.category.startsWith("10-") === false &&
        s.category.startsWith("11-") === false,
    );
    expect(normal.length).toBeGreaterThan(0);
    for (const s of normal) {
      expect(s.expect.calc_exit, `scenario ${s.id} calc_exit`).toBe(0);
      expect(s.expect.fifo_exit, `scenario ${s.id} fifo_exit`).toBe(0);
      expect(s.expect.json_exit, `scenario ${s.id} json_exit`).toBe(0);
      expect(s.expect.en_exit, `scenario ${s.id} en_exit`).toBe(0);
      expect(s.expect.validate_exit, `scenario ${s.id} validate_exit`).toBe(0);
      // warning_count is 0 for most, but 1 for cross-year scenarios (e.g. 033, 095)
      expect(
        s.expect.warning_count,
        `scenario ${s.id} warning_count`,
      ).toBeLessThanOrEqual(1);
    }
  });
});
