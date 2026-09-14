"""Shared pytest fixtures for the minus-tracker ADK agent suite.

Extracted from `test_tool_discovery.py` (Task 68) when `test_smoke.py`
(Task 69, TC-250) became this fixture's second consumer — Task 68's own
docstring noted "No conftest.py: the one fixture this suite needs is
declared directly below rather than split into a separate file, since it
has exactly one consumer", which stops being true the moment a second file
needs the same real, locally-running `minus-tracker-mcp` (stdio) instance.
Splitting it out here, rather than copy-pasting the fixture into
`test_smoke.py`, is what keeps the two files from silently drifting apart
on how the server is spawned/built.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Iterator, List, Tuple

import pytest

# tests/conftest.py -> tests/ -> agent/ -> minus-tracker/ (the TS package
# root, sibling to this Python subproject per Part 20's "Package & Location").
REPO_ROOT = Path(__file__).resolve().parents[2]
DIST_MCP_ENTRY = REPO_ROOT / "dist" / "mcp" / "index.js"

_BUILD_TIMEOUT_SECONDS = 300


@pytest.fixture(scope="session")
def mcp_server_command() -> Iterator[Tuple[str, List[str]]]:
    """`(command, args)` to spawn the stdio `minus-tracker-mcp` server.

    Both TC-249/TC-251 (`test_tool_discovery.py`) and TC-250
    (`test_smoke.py`) need a real, locally-running `minus-tracker-mcp`
    (stdio) instance — a direct MCP client, no LLM call. Rather than relying
    on `minus-tracker-mcp` being on PATH (a real end-user install per Part
    20's Installation section, but not guaranteed in a bare checkout running
    only this pytest suite), this spawns the freshly-built
    `dist/mcp/index.js` from the sibling TypeScript package directly via
    `node`, building it first if needed — the same build this repo's own
    toolchain runs before `npm test` (AGENTS.md).

    Skips (not fails) the tests that depend on this fixture if the build
    genuinely cannot be produced here (no `npm`/`node` toolchain reachable,
    or the build itself fails) — that is an environment limitation, not a
    finding about this task's own code, and is reported loudly on stderr so
    it is never mistaken for a silent pass.
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
            reason = (
                f"Could not build minus-tracker-mcp "
                f"(run `npm ci && npm run build` in {REPO_ROOT} first): {exc}"
            )
            print(f"SKIP: {reason}", file=sys.stderr)
            pytest.skip(reason)

    if not DIST_MCP_ENTRY.exists():
        reason = (
            f"{DIST_MCP_ENTRY} still missing after `npm run build` — "
            "check the build output."
        )
        print(f"SKIP: {reason}", file=sys.stderr)
        pytest.skip(reason)

    yield "node", [str(DIST_MCP_ENTRY)]
