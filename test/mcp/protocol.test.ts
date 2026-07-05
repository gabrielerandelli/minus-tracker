import { describe, it, expect, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  parseTransactionsInputSchema,
  classifyInstrumentsInputSchema,
  calculateGainsInputSchema,
  transactionSchema,
  classificationMapSchema,
  classificationEntrySchema,
  assetClassSchema,
  carryForwardSchema,
  incomeRowSchema,
} from "../../src/mcp/schemas.generated.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");

/**
 * TC-115: Protocol-level — all 3 tools registered with valid JSON schemas.
 *
 * Connects an in-memory Client/Server transport pair, lists tools, and
 * compiles each returned inputSchema with a fresh ajv instance (independent
 * of the validator instance server.ts uses internally) to prove the schemas
 * are valid, standalone-compilable JSON Schema.
 */
describe("TC-115 — protocol-level tool registration and schema validity", () => {
  it("lists exactly the 3 expected tools with compilable inputSchemas", async () => {
    const { server } = await import("../../src/mcp/server.js");
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      ["calculate_gains", "classify_instruments", "parse_transactions"].sort(),
    );

    const ajv = new Ajv({ strict: false });
    for (const tool of tools) {
      expect(() => ajv.compile(tool.inputSchema)).not.toThrow();
    }

    await client.close();
    await server.close();
  });
});

/**
 * TC-116: Invalid tool input rejected by schema validation before the
 * handler runs.
 *
 * server.ts's low-level `Server` doesn't validate CallToolRequest arguments
 * itself (only the SDK's higher-level McpServer + Zod schemas do that) — so
 * server.ts runs its own ajv-compiled validation in front of every tool
 * dispatch (see the VALIDATORS map in src/mcp/server.ts). This test mocks
 * out the real `calculate_gains` handler to prove malformed input never
 * reaches it.
 */
const handleCalculateGainsSpy = vi.fn(async () => ({
  content: [{ type: "text" as const, text: "should never be called" }],
}));

vi.mock("../../src/mcp/tools/calculate-gains.js", () => ({
  handleCalculateGains: handleCalculateGainsSpy,
}));

describe("TC-116 — malformed calculate_gains input rejected pre-handler", () => {
  it("rejects an invalid method value without invoking the handler", async () => {
    const { server } = await import("../../src/mcp/server.js");
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const result = await client.callTool({
      name: "calculate_gains",
      arguments: { transactions: [], method: "INVALID_METHOD" },
    });

    expect(handleCalculateGainsSpy).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);

    const text = (result.content as Array<{ type: string; text: string }>)[0]!
      .text;
    const parsed = JSON.parse(text) as { code?: string };
    expect(parsed.code).toBe("VALIDATION_ERROR");
    expect(parsed.code).not.toBe("CALCULATION_ERROR");

    await client.close();
    await server.close();
  });
});

/**
 * TC-117: Build-time generated input schemas match `types.ts` shapes.
 *
 * Input schemas are generated from src/types.ts by
 * scripts/generate-mcp-schemas.js, not hand-written — this guards against
 * schema drift.
 */
describe("TC-117 — generated MCP schemas match types.ts shapes", () => {
  describe("Step 1+2: shared-type schemas exist and their field sets match types.ts exactly", () => {
    it("Transaction", () => {
      expect(Object.keys(transactionSchema.properties).sort()).toEqual(
        [
          "isin",
          "product",
          "date",
          "type",
          "quantity",
          "pricePerUnit",
          "currency",
          "totalLocal",
          "totalEUR",
          "feesEUR",
          "fxRate",
        ].sort(),
      );
      expect(transactionSchema.required.slice().sort()).toEqual(
        [
          "isin",
          "product",
          "date",
          "type",
          "quantity",
          "pricePerUnit",
          "currency",
          "totalLocal",
          "totalEUR",
          "feesEUR",
        ].sort(),
      );
    });

    it("ClassificationMap (Record<string, ClassificationEntry>)", () => {
      expect(classificationMapSchema.type).toBe("object");
      expect(classificationMapSchema.additionalProperties).toEqual({
        $ref: "#/definitions/ClassificationEntry",
      });
    });

    it("ClassificationEntry", () => {
      expect(Object.keys(classificationEntrySchema.properties).sort()).toEqual(
        [
          "product",
          "assetClass",
          "bucketGain",
          "bucketLoss",
          "taxRate",
          "whiteListed",
          "confirmedByUser",
          "source",
        ].sort(),
      );
      expect(classificationEntrySchema.required.slice().sort()).toEqual(
        [
          "product",
          "assetClass",
          "bucketGain",
          "bucketLoss",
          "taxRate",
          "whiteListed",
          "confirmedByUser",
          "source",
        ].sort(),
      );
    });

    it("AssetClass (string union)", () => {
      expect(assetClassSchema.type).toBe("string");
      expect(assetClassSchema.enum.slice().sort()).toEqual(
        [
          "ETF",
          "Stock",
          "ETC",
          "GovtBondWL",
          "GovtBondOther",
          "CorpBond",
          "Derivative",
          "LeverageCert",
          "CapProtectedCert",
        ].sort(),
      );
    });

    it("CarryForward", () => {
      expect(Object.keys(carryForwardSchema.properties).sort()).toEqual(
        ["year", "amount"].sort(),
      );
      expect(carryForwardSchema.required.slice().sort()).toEqual(
        ["year", "amount"].sort(),
      );
    });

    it("IncomeRow", () => {
      expect(Object.keys(incomeRowSchema.properties).sort()).toEqual(
        [
          "isin",
          "product",
          "date",
          "incomeType",
          "grossAmount",
          "withholdingTax",
          "currency",
          "fxRate",
        ].sort(),
      );
      expect(incomeRowSchema.required.slice().sort()).toEqual(
        [
          "isin",
          "product",
          "date",
          "incomeType",
          "grossAmount",
          "withholdingTax",
          "currency",
        ].sort(),
      );
    });
  });

  describe("Step 1+2: tool-wrapper schemas match their types.ts interface exactly", () => {
    it("parse_transactions input (ParseTransactionsInput)", () => {
      expect(parseTransactionsInputSchema.type).toBe("object");
      expect(
        Object.keys(parseTransactionsInputSchema.properties).sort(),
      ).toEqual(["csv"].sort());
      expect(parseTransactionsInputSchema.required.slice().sort()).toEqual(
        ["csv"].sort(),
      );
    });

    it("classify_instruments input (ClassifyInstrumentsInput)", () => {
      expect(classifyInstrumentsInputSchema.type).toBe("object");
      expect(
        Object.keys(classifyInstrumentsInputSchema.properties).sort(),
      ).toEqual(
        [
          "transactions",
          "existingClassification",
          "overrides",
          "offline",
        ].sort(),
      );
      expect(classifyInstrumentsInputSchema.required.slice().sort()).toEqual(
        ["transactions"].sort(),
      );
    });

    it("calculate_gains input (CalculateGainsInput)", () => {
      expect(calculateGainsInputSchema.type).toBe("object");
      expect(Object.keys(calculateGainsInputSchema.properties).sort()).toEqual(
        [
          "transactions",
          "method",
          "parseWarnings",
          "classification",
          "carryForward",
          "incomeRows",
        ].sort(),
      );
      expect(calculateGainsInputSchema.required.slice().sort()).toEqual(
        ["transactions", "method"].sort(),
      );
    });
  });

  describe("Step 3: adding a field to a fixture copy of types.ts and regenerating surfaces it automatically", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-schema-drift-"));
    const fixtureTypesPath = path.join(tmpDir, "types.fixture.ts");
    const fixtureOutputPath = path.join(tmpDir, "schemas.fixture.ts");

    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("new field on ParseTransactionsInput appears in the regenerated schema with no manual step", () => {
      const realTypesSource = fs.readFileSync(
        path.join(repoRoot, "src/types.ts"),
        "utf8",
      );

      // Sanity check: the anchor text we're about to rewrite is unique in the
      // real file, so this fixture edit only touches ParseTransactionsInput.
      const anchor =
        "export interface ParseTransactionsInput {\n  csv: string;\n}";
      expect(realTypesSource).toContain(anchor);

      const fixtureSource = realTypesSource.replace(
        anchor,
        "export interface ParseTransactionsInput {\n  csv: string;\n  driftTestField?: string;\n}",
      );
      fs.writeFileSync(fixtureTypesPath, fixtureSource);

      execFileSync(
        process.execPath,
        [
          path.join(repoRoot, "scripts/generate-mcp-schemas.js"),
          fixtureTypesPath,
          fixtureOutputPath,
        ],
        { cwd: repoRoot },
      );

      const generatedFixture = fs.readFileSync(fixtureOutputPath, "utf8");
      expect(generatedFixture).toContain('"driftTestField"');
      expect(generatedFixture).toMatch(
        /parseTransactionsInputSchema[\s\S]*"driftTestField"/,
      );
    });
  });
});
