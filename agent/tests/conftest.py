"""Shared fixtures for the ADK agent's pytest suite (PRD Part 20)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

# .../minus-tracker/agent/tests/conftest.py -> .../minus-tracker
REPO_ROOT = Path(__file__).resolve().parents[2]
MCP_ENTRY = REPO_ROOT / "dist" / "mcp" / "index.js"


@pytest.fixture(scope="session")
def mcp_server_entry() -> Path:
    """Path to the built `minus-tracker-mcp` entry point (stdio).

    Builds the TypeScript package once per test session when `dist/` is
    missing, mirroring this repo's own toolchain (AGENTS.md:
    `npm ci && npm run build`). Skips — rather than fails — when Node/npm
    aren't on PATH, since building the TS package isn't this Python
    subproject's own responsibility.
    """
    node = shutil.which("node")
    npm = shutil.which("npm")
    if node is None or npm is None:
        pytest.skip("node/npm not on PATH — can't build/run minus-tracker-mcp")

    if not MCP_ENTRY.exists():
        subprocess.run([npm, "run", "build"], cwd=REPO_ROOT, check=True)

    if not MCP_ENTRY.exists():
        pytest.fail(f"`npm run build` did not produce {MCP_ENTRY}")

    return MCP_ENTRY


@pytest.fixture
def mcp_stdio_env(
    mcp_server_entry: Path, monkeypatch: pytest.MonkeyPatch
) -> Path:
    """Points the agent's default stdio transport at the built server.

    A real install expects `minus-tracker-mcp` on PATH (a global/linked npm
    install — PRD Part 20's "zero setup"); this checkout has no such link,
    so tests spawn it the same way a user with an unlinked checkout would,
    via the COMMAND/ARGS overrides.
    """
    monkeypatch.setenv("MINUS_TRACKER_MCP_COMMAND", "node")
    monkeypatch.setenv("MINUS_TRACKER_MCP_ARGS", str(mcp_server_entry))
    monkeypatch.delenv("MINUS_TRACKER_MCP_TRANSPORT", raising=False)
    monkeypatch.delenv("MINUS_TRACKER_MCP_URL", raising=False)
    return mcp_server_entry
