import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as net from "node:net";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Task 67 — Streamable HTTP/SSE Transport E2E smoke tests.
 *
 * Extends the stdio E2E smoke test (TC-120, `test/mcp/e2e.test.ts`) with an
 * equivalent run over `--transport sse`, against the real built
 * `dist/mcp/index.js` binary (same tier as TC-120 — the one that catches
 * bin/build/transport-bootstrap issues the unit and protocol-level
 * (in-memory transport) tests can't see).
 *
 * Requires `npm run build` to have already produced dist/mcp/index.js.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");
const distMcpEntry = path.join(repoRoot, "dist/mcp/index.js");
const sampleCsvPath = path.join(repoRoot, "samples/sample-trades.csv");

// A real non-loopback interface, when one is available in this environment
// (present in CI/sandbox containers with an eth0-style interface; may be
// absent on some local dev machines with only loopback). TC-246's
// "not reachable on a LAN-facing address" step only makes sense when such an
// interface exists — otherwise it's skipped rather than false-passing on a
// fabricated address.
function findNonLoopbackIPv4(): string | undefined {
  const interfaces = os.networkInterfaces();
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return undefined;
}

/** Finds a currently-free TCP port by binding to port 0 and releasing it. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close();
        reject(new Error("could not determine a free port"));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

/** Attempts a bare TCP connect; resolves true iff the connection succeeds. */
function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 2000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function textOf(result: { content: unknown }): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]!.text;
}

type GainsReport = { method: string; lots: unknown[]; generatedAt: string };

/** Deep-clones a `GainsReport`-shaped value with every `generatedAt` field
 * removed (the top-level one and `dichiarazione.generatedAt`) — both are
 * real timestamps that legitimately differ between two separate runs and
 * must not be compared for the "identical report" assertion. */
function withoutGeneratedAt(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutGeneratedAt);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "generatedAt") continue;
      result[key] = withoutGeneratedAt(entry);
    }
    return result;
  }
  return value;
}

/** Runs the full parse → classify (offline) → calculate sequence over a
 * connected client, mirroring TC-120's stdio sequence exactly. */
async function runToolSequence(client: Client): Promise<GainsReport> {
  const csv = fs.readFileSync(sampleCsvPath, "utf-8");

  const parseResult = await client.callTool({
    name: "parse_transactions",
    arguments: { csv },
  });
  expect(parseResult.isError).toBeFalsy();
  const { transactions } = JSON.parse(textOf(parseResult)) as {
    transactions: unknown[];
  };

  const classifyResult = await client.callTool({
    name: "classify_instruments",
    arguments: { transactions, offline: true },
  });
  expect(classifyResult.isError).toBeFalsy();
  const { classification } = JSON.parse(textOf(classifyResult)) as {
    classification: Record<string, unknown>;
  };

  const calculateResult = await client.callTool({
    name: "calculate_gains",
    arguments: { transactions, method: "LIFO", classification },
  });
  expect(calculateResult.isError).toBeFalsy();
  return JSON.parse(textOf(calculateResult)) as GainsReport;
}

/** Spawns `dist/mcp/index.js` with the given extra argv and waits for it to
 * report that it is listening (or exit early on a usage error). */
function spawnSseServer(args: string[]): {
  child: ChildProcess;
  ready: Promise<void>;
} {
  const child = spawn(process.execPath, [distMcpEntry, ...args], {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "pipe"],
  });

  const ready = new Promise<void>((resolve, reject) => {
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.includes("listening on")) resolve();
    });
    child.once("exit", (code) => {
      reject(new Error(`server exited early (code ${code}): ${stderr}`));
    });
    child.once("error", reject);
  });

  return { child, ready };
}

async function stopServer(child: ChildProcess): Promise<void> {
  child.kill();
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

describe("Task 67 — Streamable HTTP/SSE transport", () => {
  beforeAll(() => {
    expect(
      fs.existsSync(distMcpEntry),
      `${distMcpEntry} is missing — run \`npm run build\` before this test.`,
    ).toBe(true);
  });

  it("TC-246: --transport sse --port <n> binds to 127.0.0.1 by default, not 0.0.0.0/LAN-facing", async () => {
    const port = await findFreePort();
    const { child, ready } = spawnSseServer([
      "--transport",
      "sse",
      "--port",
      String(port),
    ]);

    try {
      await ready;

      // Step 1: reachable on 127.0.0.1.
      expect(await canConnect("127.0.0.1", port)).toBe(true);

      // Step 2: not reachable on a real non-loopback address, when this
      // environment has one.
      const lanAddress = findNonLoopbackIPv4();
      if (lanAddress !== undefined) {
        expect(await canConnect(lanAddress, port)).toBe(false);
      }
    } finally {
      await stopServer(child);
    }
  }, 20_000);

  it("TC-247: --host <address> overrides the localhost-bind default", async () => {
    const lanAddress = findNonLoopbackIPv4();
    if (lanAddress === undefined) {
      // No non-loopback interface in this environment to prove an override
      // against — nothing meaningful to assert beyond TC-246's coverage.
      return;
    }

    const port = await findFreePort();
    const { child, ready } = spawnSseServer([
      "--transport",
      "sse",
      "--port",
      String(port),
      "--host",
      lanAddress,
    ]);

    try {
      await ready;

      // The explicit --host is reachable...
      expect(await canConnect(lanAddress, port)).toBe(true);
      // ...proving --host is a real override, not silently ignored (the
      // localhost default would have failed the check above).
    } finally {
      await stopServer(child);
    }
  }, 20_000);

  it("TC-248: the same tool sequence over SSE produces an identical GainsReport to stdio", async () => {
    // stdio run (mirrors TC-120).
    const stdioTransport = new StdioClientTransport({
      command: process.execPath,
      args: [distMcpEntry],
      cwd: repoRoot,
    });
    const stdioClient = new Client({ name: "e2e-sse-test-stdio", version: "0.0.0" });
    await stdioClient.connect(stdioTransport);
    const stdioReport = await runToolSequence(stdioClient);
    await stdioClient.close();

    // SSE run, same sequence, same sample CSV.
    const port = await findFreePort();
    const { child, ready } = spawnSseServer([
      "--transport",
      "sse",
      "--port",
      String(port),
    ]);

    let sseReport: GainsReport;
    try {
      await ready;

      const sseTransport = new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp`),
      );
      const sseClient = new Client({ name: "e2e-sse-test-sse", version: "0.0.0" });
      await sseClient.connect(sseTransport);
      sseReport = await runToolSequence(sseClient);
      await sseClient.close();
    } finally {
      await stopServer(child);
    }

    // `generatedAt` fields are real timestamps and legitimately differ
    // between the two runs — everything else must be byte-identical.
    expect(withoutGeneratedAt(sseReport)).toEqual(
      withoutGeneratedAt(stdioReport),
    );
    expect(typeof sseReport.generatedAt).toBe("string");
  }, 30_000);
});
