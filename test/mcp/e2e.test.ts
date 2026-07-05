import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ReadBuffer,
  serializeMessage,
} from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/**
 * TC-120: E2E smoke — stdio client drives the full
 * parse_transactions → classify_instruments → calculate_gains sequence
 * against the real built `dist/mcp/index.js` binary (real shebang, real
 * bin wiring, real stdio pipes) — the one tier that catches bin/build
 * issues the unit and protocol-level (in-memory transport) tests can't see.
 *
 * Requires `npm run build` to have already produced dist/mcp/index.js.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");
const distMcpEntry = path.join(repoRoot, "dist/mcp/index.js");
const sampleCsvPath = path.join(repoRoot, "samples/sample-trades.csv");

function textOf(result: { content: unknown }): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]!.text;
}

/**
 * A minimal `Transport` (the SDK's own public, documented interface — see
 * `@modelcontextprotocol/sdk/shared/transport.js`) that spawns and owns the
 * child process itself, using the SDK's public `ReadBuffer`/`serializeMessage`
 * framing helpers for the wire protocol. This mirrors what
 * `StdioClientTransport` does internally, but keeps the `ChildProcess`
 * reference public so the real exit code can be observed via the standard
 * Node `"exit"` event instead of reaching into SDK-private fields.
 */
class OwnedProcessTransport implements Transport {
  readonly child: ChildProcess;
  private readonly spawnPromise: Promise<void>;
  private readonly readBuffer = new ReadBuffer();
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(command: string, args: string[], cwd: string) {
    this.child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "inherit"],
    });

    this.spawnPromise = new Promise((resolve, reject) => {
      this.child.once("spawn", () => resolve());
      this.child.once("error", reject);
    });

    this.child.on("close", () => this.onclose?.());
    this.child.stdout?.on("data", (chunk: Buffer) => {
      this.readBuffer.append(chunk);
      let message: JSONRPCMessage | null;
      while ((message = this.readBuffer.readMessage()) !== null) {
        this.onmessage?.(message);
      }
    });
    this.child.stdout?.on("error", (err) => this.onerror?.(err));
    this.child.stdin?.on("error", (err) => this.onerror?.(err));
  }

  start(): Promise<void> {
    return this.spawnPromise;
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      this.child.stdin?.write(serializeMessage(message), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    this.child.stdin?.end();
  }

  /** Resolves with the real process exit code once the child exits. */
  waitForExit(): Promise<number | null> {
    return new Promise((resolve) => {
      this.child.once("exit", (code) => resolve(code));
    });
  }
}

describe("TC-120: MCP E2E smoke test — full stdio round-trip", () => {
  beforeAll(() => {
    expect(
      fs.existsSync(distMcpEntry),
      `${distMcpEntry} is missing — run \`npm run build\` before this test.`,
    ).toBe(true);
  });

  it("parse → classify (offline) → calculate succeeds over real stdio; subprocess exits 0", async () => {
    const transport = new OwnedProcessTransport(
      process.execPath,
      [distMcpEntry],
      repoRoot,
    );
    const exitCode = transport.waitForExit();

    const client = new Client({ name: "e2e-test-client", version: "0.0.0" });
    await client.connect(transport);

    const csv = fs.readFileSync(sampleCsvPath, "utf-8");

    const parseResult = await client.callTool({
      name: "parse_transactions",
      arguments: { csv },
    });
    expect(parseResult.isError).toBeFalsy();
    const { transactions } = JSON.parse(textOf(parseResult)) as {
      transactions: unknown[];
    };
    expect(Array.isArray(transactions)).toBe(true);
    expect(transactions.length).toBeGreaterThan(0);

    const classifyResult = await client.callTool({
      name: "classify_instruments",
      arguments: { transactions, offline: true },
    });
    expect(classifyResult.isError).toBeFalsy();
    const { classification } = JSON.parse(textOf(classifyResult)) as {
      classification: Record<string, unknown>;
    };
    expect(Object.keys(classification).length).toBeGreaterThan(0);

    const calculateResult = await client.callTool({
      name: "calculate_gains",
      arguments: { transactions, method: "LIFO", classification },
    });
    expect(calculateResult.isError).toBeFalsy();
    const report = JSON.parse(textOf(calculateResult)) as {
      method: string;
      lots: unknown[];
    };
    expect(report.method).toBe("LIFO");
    expect(Array.isArray(report.lots)).toBe(true);

    await client.close();

    await expect(exitCode).resolves.toBe(0);
  }, 20_000);
});
