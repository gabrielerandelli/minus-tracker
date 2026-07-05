import { fileURLToPath } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";
import { Ajv, type ValidateFunction } from "ajv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  parseTransactionsInputSchema,
  classifyInstrumentsInputSchema,
  calculateGainsInputSchema,
} from "./schemas.generated.js";
import { handleParseTransactions } from "./tools/parse-transactions.js";
import { handleClassifyInstruments } from "./tools/classify-instruments.js";
import { handleCalculateGains } from "./tools/calculate-gains.js";
import type {
  ParseTransactionsInput,
  ClassifyInstrumentsInput,
  CalculateGainsInput,
} from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getPackageVersion(): string {
  const pkgPath = path.join(__dirname, "../../package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    version: string;
  };
  return pkg.version;
}

// The generated schemas are `as const` (readonly) for precise field-level
// type inference in tests; the SDK's `Tool["inputSchema"]` type expects
// mutable arrays, so we cast at the point of use.
const TOOLS: Tool[] = [
  {
    name: "parse_transactions",
    description: "Parse a DEGIRO transactions CSV export into Transaction[].",
    inputSchema: parseTransactionsInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "classify_instruments",
    description:
      "Classify transactions' ISINs into asset classes (stateless mode).",
    inputSchema:
      classifyInstrumentsInputSchema as unknown as Tool["inputSchema"],
  },
  {
    name: "calculate_gains",
    description: "Calculate LIFO/FIFO capital gains from transactions.",
    inputSchema: calculateGainsInputSchema as unknown as Tool["inputSchema"],
  },
];

const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

// The low-level `Server` class (unlike the SDK's higher-level `McpServer`,
// which only accepts Zod schemas) does not itself validate `CallToolRequest`
// arguments against a tool's `inputSchema` — that's why we compile and run
// the generated JSON Schemas ourselves here, rejecting malformed input before
// any tool handler runs (TC-116).
const ajv = new Ajv({ allErrors: true, strict: false });
const VALIDATORS: Record<string, ValidateFunction> = {
  parse_transactions: ajv.compile(parseTransactionsInputSchema),
  classify_instruments: ajv.compile(classifyInstrumentsInputSchema),
  calculate_gains: ajv.compile(calculateGainsInputSchema),
};

export const server = new Server(
  { name: "minus-tracker-mcp", version: getPackageVersion() },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;

  if (!TOOL_NAMES.has(name)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            code: "UNKNOWN_TOOL",
            message: `Unknown tool: ${name}`,
          }),
        },
      ],
    };
  }

  const validate = VALIDATORS[name];
  if (validate && !validate(args)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            code: "VALIDATION_ERROR",
            errors: validate.errors,
          }),
        },
      ],
    };
  }

  switch (name) {
    case "parse_transactions":
      return handleParseTransactions(args as unknown as ParseTransactionsInput);
    case "classify_instruments":
      return handleClassifyInstruments(
        args as unknown as ClassifyInstrumentsInput,
        {
          _meta: request.params._meta,
          sendNotification: extra.sendNotification,
        },
      );
    case "calculate_gains":
      return handleCalculateGains(args as unknown as CalculateGainsInput);
    default:
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              code: "UNKNOWN_TOOL",
              message: `Unknown tool: ${name}`,
            }),
          },
        ],
      };
  }
});
