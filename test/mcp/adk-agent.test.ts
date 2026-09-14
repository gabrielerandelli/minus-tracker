import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

/**
 * TC-249, TC-251 (docs/prd/20-adk-agent.md, Task 68) — vitest bridge.
 *
 * The ADK agent in `minus-tracker/agent/` is a deliberately separate Python
 * subproject (its own `pyproject.toml`, its own `pytest` suite in
 * `agent/tests/test_tool_discovery.py`) — never imported by, or bundled
 * into, this npm package (docs/prd/20-adk-agent.md "Package & Location").
 * That suite is the one place that actually asserts anything for these two
 * TCs; nothing here re-implements or duplicates an assertion.
 *
 * The reason this file exists at all: this repo's own build/verify tooling
 * (`npm test` locally, and `do-impl-plan.js`'s independent per-task verify
 * step, AGENTS.md) is vitest-based and has no other way to observe a
 * Python-only test result — a real, previously-hit failure mode in this
 * exact repo (docs/new-workflow-problems.md Root cause B: a task whose
 * production code was correct still failed verification because no TC-NNN
 * test file existed anywhere vitest could see). Task 68's own two prior
 * attempts both re-verified the Python code was correct (it was, and still
 * is) without ever closing this gap, so a third attempt fixing only the
 * Python side again would reproduce the same failure. This file is that
 * fix: two `describe` blocks named for TC-249/TC-251 (matching this repo's
 * "grouped file, matched by describe block" convention for related TCs —
 * see e.g. test/mcp/e2e.test.ts's TC-120), each shelling out to the real
 * `pytest` suite via its `tc249`/`tc251` markers (agent/pyproject.toml) and
 * asserting a real exit code — not a hardcoded pass.
 *
 * Bootstrapping a Python venv (rather than assuming one is already active)
 * mirrors the sibling suite's own precedent: `test_tool_discovery.py`'s
 * `mcp_server_command` fixture already self-builds `dist/mcp/index.js` via
 * `npm run build` if missing, rather than assuming a pre-built tree. The
 * one-time `pip install` cost is paid once (the venv persists under
 * `agent/.venv`, already gitignored by `agent/.gitignore`); every run after
 * the first just re-checks importability, which is fast.
 *
 * If Python 3.10+ (per `agent/pyproject.toml`'s `requires-python`) or a
 * network path to install `google-adk`/`mcp` genuinely isn't available in a
 * given environment, both tests below skip (loudly, via console.error) —
 * an environment limitation, not a finding about this task's own code,
 * exactly the same distinction `mcp_server_command` already draws for a
 * missing Node/npm toolchain.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");
const agentDir = path.join(repoRoot, "agent");
const venvDir = path.join(agentDir, ".venv");
const venvPython =
  process.platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");

const SETUP_TIMEOUT_MS = 10 * 60 * 1000; // fresh `pip install -e .[dev]` pulls a sizeable tree
const PYTEST_TIMEOUT_MS = 5 * 60 * 1000; // includes self-building dist/mcp/index.js if missing

function systemPython(): string {
  return process.env.MINUS_TRACKER_AGENT_PYTHON || "python3";
}

function commandSucceeds(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: "ignore", timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures `agent/.venv` exists with the agent's `dev` extras installed.
 * Returns whether a usable interpreter is available; never throws — a
 * setup failure here is reported as a skip, not a hard test failure, per
 * this file's own module docstring.
 */
function ensurePythonEnv(): { ok: boolean; reason?: string } {
  try {
    if (!fs.existsSync(venvPython)) {
      if (!commandSucceeds(systemPython(), ["--version"])) {
        return { ok: false, reason: `${systemPython()} not found on PATH` };
      }
      execFileSync(systemPython(), ["-m", "venv", venvDir], {
        stdio: "pipe",
        timeout: 120_000,
      });
    }

    if (commandSucceeds(venvPython, ["-c", "import google.adk, mcp, pytest"])) {
      return { ok: true };
    }

    execFileSync(venvPython, ["-m", "pip", "install", "-q", "-e", ".[dev]"], {
      cwd: agentDir,
      stdio: "pipe",
      timeout: SETUP_TIMEOUT_MS,
    });
    return { ok: true };
  } catch (err) {
    const e = err as { message?: string; stderr?: Buffer | string };
    const stderr = e.stderr
      ? Buffer.isBuffer(e.stderr)
        ? e.stderr.toString("utf-8")
        : e.stderr
      : "";
    return { ok: false, reason: `${e.message ?? err}\n${stderr}`.trim() };
  }
}

function runPytestMarker(marker: string): { code: number; output: string } {
  try {
    const output = execFileSync(venvPython, ["-m", "pytest", "-q", "-m", marker], {
      cwd: agentDir,
      encoding: "utf-8",
      timeout: PYTEST_TIMEOUT_MS,
    });
    return { code: 0, output };
  } catch (err) {
    const e = err as {
      status?: number | null;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      code: e.status ?? 1,
      output: `${e.stdout ?? ""}\n${e.stderr ?? ""}${e.message ?? ""}`.trim(),
    };
  }
}

let pythonEnv: { ok: boolean; reason?: string } = { ok: false };

beforeAll(() => {
  pythonEnv = ensurePythonEnv();
  if (!pythonEnv.ok) {
    console.error(
      `SKIP: could not set up a Python env for minus-tracker/agent — ${pythonEnv.reason}\n` +
        `Run \`cd agent && pip install -e ".[dev]"\` manually to reproduce.`,
    );
  }
}, SETUP_TIMEOUT_MS);

describe("TC-249 — ADK agent/ pytest: MCPToolset wiring discovers the expected tool set", () => {
  it(
    "pytest -m tc249 passes (agent/tests/test_tool_discovery.py)",
    (ctx) => {
      if (!pythonEnv.ok) {
        ctx.skip();
        return;
      }
      const { code, output } = runPytestMarker("tc249");
      expect(code, `pytest -m tc249 in agent/ failed:\n${output}`).toBe(0);
    },
    PYTEST_TIMEOUT_MS,
  );
});

describe("TC-251 — MINUS_TRACKER_MCP_TRANSPORT=sse without MINUS_TRACKER_MCP_URL fails clearly", () => {
  it(
    "pytest -m tc251 passes (agent/tests/test_tool_discovery.py)",
    (ctx) => {
      if (!pythonEnv.ok) {
        ctx.skip();
        return;
      }
      const { code, output } = runPytestMarker("tc251");
      expect(code, `pytest -m tc251 in agent/ failed:\n${output}`).toBe(0);
    },
    PYTEST_TIMEOUT_MS,
  );
});
