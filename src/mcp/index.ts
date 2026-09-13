import { parseArgs } from "node:util";
import * as http from "node:http";
import { server, createServer } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Part 19 / Task 67 — a second, opt-in transport alongside the default
// stdio one. `--transport` and `--port` are the only flags stdio mode ever
// looks at (it ignores them entirely, matching the pre-Task-67 zero-flag
// behavior every existing stdio caller — Claude Desktop, the E2E smoke
// test — already relies on).
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    transport: { type: "string", default: "stdio" },
    port: { type: "string" },
    host: { type: "string" },
  },
  strict: true,
});

async function main(): Promise<void> {
  const transport = values.transport;

  if (transport === "stdio") {
    await server.connect(new StdioServerTransport());
    return;
  }

  if (transport !== "sse") {
    process.stderr.write(
      `minus-tracker-mcp: unknown --transport value "${transport}" (expected "stdio" or "sse")\n`,
    );
    process.exit(2);
    return;
  }

  if (!values.port) {
    process.stderr.write(
      "minus-tracker-mcp: --transport sse requires --port <n>\n",
    );
    process.exit(2);
    return;
  }

  const port = Number(values.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    process.stderr.write(
      `minus-tracker-mcp: invalid --port value "${values.port}"\n`,
    );
    process.exit(2);
    return;
  }

  // Deliberate localhost-only default (Part 19): SSE mode has no
  // authentication in v0.13.0 and these tools operate on real financial
  // transaction data, so binding is never `0.0.0.0` unless an operator
  // explicitly opts in via `--host`.
  const host = values.host ?? "127.0.0.1";

  await startSseServer(host, port);
}

/**
 * Starts the Streamable HTTP/SSE listener. The server stays stateless
 * regardless of transport (Part 19's Design Principle) — every tool call is
 * fully self-contained inline I/O — so each HTTP request gets its own
 * `Server`/`StreamableHTTPServerTransport` pair (the SDK's documented
 * stateless-mode pattern: a single `Server` can only be connected to one
 * transport at a time), rather than any connection- or session-scoped state.
 */
function startSseServer(host: string, port: number): Promise<void> {
  const httpServer = http.createServer((req, res) => {
    void handleSseRequest(req, res);
  });

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      process.stderr.write(
        `minus-tracker-mcp: listening on http://${host}:${port} (transport: sse)\n`,
      );
      resolve();
    });
  });
}

async function handleSseRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const requestServer = createServer();
  const requestTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void requestTransport.close();
    void requestServer.close();
  });

  try {
    await requestServer.connect(requestTransport);
    await requestTransport.handleRequest(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          code: "TRANSPORT_ERROR",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}

await main();
