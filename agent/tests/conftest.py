"""Shared fixtures for the minus-tracker ADK agent's pytest suite.

TC-249/TC-251 (docs/test_plan/25-mcp-extensions-adk-agent.md) both need a
real, locally-running `minus-tracker-mcp` (stdio) instance — a direct MCP
client, no LLM call. Rather than relying on `minus-tracker-mcp` being on
PATH (a real end-user install per Part 20's Installation section, but not
guaranteed in a bare checkout running only this pytest suite), these
fixtures spawn the freshly-built `dist/mcp/index.js` from the sibling
TypeScript package directly via `node`, building it first if needed.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Iterator, List, Tuple

import pytest

# agent/tests/conftest.py -> agent/ -> minus-tracker/ (the TS package root,
# sibling to this Python subproject per Part 20's "Package & Location").
REPO_ROOT = Path(__file__).resolve().parents[2]
DIST_MCP_ENTRY = REPO_ROOT / "dist" / "mcp" / "index.js"

_BUILD_TIMEOUT_SECONDS = 300


@pytest.fixture(scope="session")
def mcp_server_entry() -> Iterator[Path]:
    """Path to the built `minus-tracker-mcp` stdio entry point.

    Builds the TypeScript package (`npm run build`) once per test session
    if `dist/mcp/index.js` isn't already present — the same build this
    repo's own toolchain runs before `npm test` (AGENTS.md).
    """
    if not DIST_MCP_ENTRY.exists():
        try:
            subprocess.run(
                ["npm", "run", "build"],
                cwd=REPO_ROOT,
                check=True,
                capture_output=True,
                text=True,
                timeout=_BUILD_TIMEOUT_SECONDS,
            )
        except (
            subprocess.CalledProcessError,
            subprocess.TimeoutExpired,
            FileNotFoundError,
        ) as exc:
            pytest.skip(
                "Could not build minus-tracker-mcp "
                f"(run `npm ci && npm run build` in {REPO_ROOT} first): {exc}"
            )

    if not DIST_MCP_ENTRY.exists():
        pytest.skip(
            f"{DIST_MCP_ENTRY} still missing after `npm run build` — "
            "check the build output."
        )

    yield DIST_MCP_ENTRY


@pytest.fixture(scope="session")
def mcp_server_command(mcp_server_entry: Path) -> Tuple[str, List[str]]:
    """`(command, args)` to spawn the stdio MCP server for tests."""
    return "node", [str(mcp_server_entry)]
