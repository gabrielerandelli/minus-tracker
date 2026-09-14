import { parseArgs } from "node:util";
import * as http from "node:http";
import { server, createServer } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Part 19 / Task 67 — a second, opt-in transport alongside the default
// stdio one. `--transport`, `--port` and `--host` are the only flags this
// entry point itself looks at; every other flag/positional must be tolerated
// (parsed but otherwise ignored), matching the pre-Task-67 zero-flag
// behavior every existing stdio caller — Claude Desktop, the E2E smoke
// test, or any other MCP host that might invoke this binary with flags of
// its own — already relies on.
//
// Root cause of the previous attempt's failed independent verification:
// `strict: true` (node:util's default) makes `parseArgs` throw
// synchronously — crashing the process before stdio ever connects — on ANY
// unrecognized flag or positional argument. That silently broke the
// "stdio, unchanged" contract for every caller passing argv this entry
// point doesn't itself define, which the previous attempt never exercised
// (the E2E smoke tests only ever spawn the binary with flags it defines).
// `strict: false` parses the flags we do define exactly as before while
// leaving anything else untouched, restoring the true zero-flag-impact
// behavior for stdio mode.
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    transport: { type: "string", default: "stdio" },
    port: { type: "string" },
    host: { type: "string" },
  },
  strict: false,
});

// With `strict: false`, a *known* option (`--transport`/`--port`/`--host`)
// given without its value parses to the boolean `true` rather than throwing
// (e.g. a trailing bare `--host`) — so each value needs a runtime string
// check before use regardless of the declared `type: "string"`, which only
// governs parsing of a value that *is* present.
function asString(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function main(): Promise<void> {
  const transport = asString(values.transport) ?? "stdio";

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

  const portValue = asString(values.port);
  if (!portValue) {
    process.stderr.write(
      "minus-tracker-mcp: --transport sse requires --port <n>\n",
    );
    process.exit(2);
    return;
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    process.stderr.write(
      `minus-tracker-mcp: invalid --port value "${portValue}"\n`,
    );
    process.exit(2);
    return;
  }

  // Deliberate localhost-only default (Part 19): SSE mode has no
  // authentication in v0.13.0 and these tools operate on real financial
  // transaction data, so binding is never `0.0.0.0` unless an operator
  // explicitly opts in via `--host`.
  const host = asString(values.host) ?? "127.0.0.1";

  await startSseServer(host, port);
}

/**
 * The `Host` header values a legitimate direct client of this bind is
 * allowed to send. Binding to loopback blocks *network-level* access from
 * other machines, but a browser tab open on the same machine is not "other
 * machines" — a page served from an attacker-controlled domain that
 * resolves to 127.0.0.1 (DNS rebinding) has the browser send requests whose
 * *destination* is our loopback port while its `Host` header still names
 * the attacker's domain. `127.0.0.1` and `localhost` are the only two names
 * a legitimate same-machine client addresses a loopback bind by, so both
 * are allowed for the default host; any other configured `--host` is
 * exact-matched only, since it was an explicit operator opt-in already
 * accepting a wider bind, not an invitation to accept arbitrary `Host`
 * values on top of that.
 */
function allowedHostsFor(host: string, port: number): string[] {
  const hosts = [`${host}:${port}`];
  if (host === "127.0.0.1") hosts.push(`localhost:${port}`);
  return hosts;
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
  const allowedHosts = allowedHostsFor(host, port);
  const httpServer = http.createServer((req, res) => {
    void handleSseRequest(req, res, allowedHosts);
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
  allowedHosts: string[],
): Promise<void> {
  const requestServer = createServer();
  const requestTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // Root-cause fix (Task 67 re-attempt): the localhost-bind default alone
    // does not stop DNS rebinding — see `allowedHostsFor` above. The SDK
    // ships exactly this mitigation (Host-header allowlisting) but leaves
    // it disabled unless explicitly opted into, which the first Task 67
    // attempt never did, silently shipping an unauthenticated SSE server
    // for real financial data that was reachable from any browser tab on
    // the same machine regardless of the loopback bind.
    enableDnsRebindingProtection: true,
    allowedHosts,
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
