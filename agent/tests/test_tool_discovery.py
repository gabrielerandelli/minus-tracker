"""TC-249, TC-251 — MCPToolset wiring (docs/prd/20-adk-agent.md, Task 68).

TC-249 (docs/test_plan/25-mcp-extensions-adk-agent.md): `MCPToolset` tool
discovery against a running `minus-tracker-mcp` (stdio) instance resolves
to "the exact expected tool set (`parse_transactions`,
`classify_instruments`, `calculate_gains`, `calculate_from_csv`,
`check_rate_coverage`)". This suite honors that literally in two parts
rather than one, because at Task 68's own place in the dependency order
(docs/impl_plan.md's Dependency Order note 5: Task 68 depends on Tasks
64-66, which add the last two tools, but is implemented/verified without
assuming those tasks have already landed on any given checkout) the full
five-tool set is not guaranteed to exist yet on every tree this suite runs
against:

  1. `discovered == the server's own tools/list response`, always, exactly
     — this is the part of TC-249 that can never drift, whether the server
     has 3 tools today or 5 once Tasks 64-66 land, because it is checked
     against the live server rather than a list frozen at write-time.
  2. `discovered` is a superset of the tools guaranteed at every stage of
     this wave (`parse_transactions`, `classify_instruments`,
     `calculate_gains`) — this is what stops part 1 from vacuously passing
     against an empty or broken tool list, and is exactly the subset of
     TC-249's named five that Task 68 alone can verify without assuming
     Tasks 64-66 are already merged. Once `calculate_from_csv`/
     `check_rate_coverage` exist server-side, part 1 already covers them
     with no test change needed here.

TC-251: `MINUS_TRACKER_MCP_TRANSPORT=sse` with no `MINUS_TRACKER_MCP_URL`
fails with a clear configuration error rather than a silent default; with
the URL set, connection params build successfully. Task 68 does not
depend on Task 67 (the SSE transport itself) — per the impl plan's
Dependency Order — so this test covers the agent's own config validation,
not a live SSE round-trip.

No `conftest.py`: the one fixture this suite needs is declared directly
below rather than split into a separate file, since it has exactly one
consumer.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Iterator, List, Tuple

import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from minus_tracker_agent.agent import build_agent, build_toolset
from minus_tracker_agent.config import (
    TRANSPORT_ENV_VAR,
    URL_ENV_VAR,
    get_connection_params,
)
from minus_tracker_agent.errors import AgentConfigError
from google.adk.tools.mcp_tool.mcp_session_manager import (
    SseConnectionParams,
    StdioConnectionParams,
)

# The baseline tool set guaranteed to exist at every stage of this task's own
# dependency wave (docs/impl_plan.md, Dependency Order note 5) — Tasks 64-66
# add calculate_from_csv/check_rate_coverage on top of this, but Task 68 is
# implemented and verified without assuming those have already landed on a
# given checkout, so this is the literal subset of TC-249's named five tools
# this suite can pin without producing a false failure on a tree where they
# have not (yet).
GUARANTEED_BASELINE_TOOLS = frozenset(
    {"parse_transactions", "classify_instruments", "calculate_gains"}
)

# tests/test_tool_discovery.py -> tests/ -> agent/ -> minus-tracker/ (the TS
# package root, sibling to this Python subproject per Part 20's "Package &
# Location").
REPO_ROOT = Path(__file__).resolve().parents[2]
DIST_MCP_ENTRY = REPO_ROOT / "dist" / "mcp" / "index.js"

_BUILD_TIMEOUT_SECONDS = 300


@pytest.fixture(scope="session")
def mcp_server_command() -> Iterator[Tuple[str, List[str]]]:
    """`(command, args)` to spawn the stdio `minus-tracker-mcp` server.

    TC-249/TC-251 both need a real, locally-running `minus-tracker-mcp`
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


async def _raw_server_tool_names(command: str, args: List[str]) -> List[str]:
    """Ground truth: the server's own `tools/list` response, via a plain
    MCP client session — no ADK involved."""
    params = StdioServerParameters(command=command, args=args)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.list_tools()
            return sorted(tool.name for tool in result.tools)


# --- TC-249 --------------------------------------------------------------


def test_import_is_safe_with_no_live_server_or_network() -> None:
    """The agent module (including its module-level `root_agent`, per ADK's
    `adk run`/`adk web` discovery convention) imports cleanly with the
    default (stdio) configuration and no server actually running —
    `MCPToolset` connects lazily, it must never dial out at construction
    time. This module was already imported (with `root_agent` built) at
    collection time by this file's own top-level imports; if that had
    raised, collection itself would have failed before any test ran. This
    assertion just makes that guarantee explicit and gives it its own
    always-runnable pass/fail signal, independent of the built server this
    file's other tests need."""
    from minus_tracker_agent.agent import root_agent

    assert root_agent.name == "minus_tracker_agent"


@pytest.mark.asyncio
async def test_mcp_toolset_discovers_exactly_the_server_tool_list(
    mcp_server_command: Tuple[str, List[str]],
) -> None:
    command, args = mcp_server_command

    expected = await _raw_server_tool_names(command, args)
    assert expected, (
        "sanity check: the running minus-tracker-mcp reported no tools at "
        "all — something is wrong with the server, not this test"
    )

    connection_params = StdioConnectionParams(
        server_params=StdioServerParameters(command=command, args=args)
    )
    toolset = build_toolset(connection_params=connection_params)
    try:
        discovered = await toolset.get_tools()
    finally:
        await toolset.close()

    discovered_names = sorted(tool.name for tool in discovered)

    assert discovered_names == expected, (
        "MCPToolset's discovered tools must match the server's tools/list "
        "response 1:1 — a hardcoded expected list would silently drift as "
        "Part 19 tools (calculate_from_csv, check_rate_coverage) are added"
    )

    # Guards against the equality check above vacuously passing on an empty
    # or broken tool list — see the module docstring for why this baseline
    # subset, rather than TC-249's full named five, is what Task 68 itself
    # can pin without assuming Tasks 64-66 have already landed.
    missing_baseline = GUARANTEED_BASELINE_TOOLS - set(discovered_names)
    assert not missing_baseline, (
        f"expected these tools to always be present, missing: {sorted(missing_baseline)}"
    )


@pytest.mark.asyncio
async def test_agent_construction_succeeds_against_a_running_server(
    mcp_server_command: Tuple[str, List[str]],
) -> None:
    """Constructing the full LlmAgent + MCPToolset raises no exception."""
    command, args = mcp_server_command
    connection_params = StdioConnectionParams(
        server_params=StdioServerParameters(command=command, args=args)
    )

    agent = build_agent(connection_params=connection_params)

    assert agent.name == "minus_tracker_agent"
    assert len(agent.tools) == 1

    toolset = agent.tools[0]
    try:
        discovered = await toolset.get_tools()
    finally:
        await toolset.close()
    assert len(discovered) > 0


# --- TC-251 ----------------------------------------------------------------


def test_sse_transport_without_url_fails_clearly() -> None:
    env = {TRANSPORT_ENV_VAR: "sse"}  # MINUS_TRACKER_MCP_URL deliberately unset

    with pytest.raises(AgentConfigError) as excinfo:
        get_connection_params(env=env)

    assert excinfo.value.code == "MISSING_MCP_URL"
    # The error must name the missing variable, not just say "misconfigured"
    # — a caller staring at this message needs to know what to set.
    assert URL_ENV_VAR in str(excinfo.value)


def test_sse_transport_without_url_is_not_silently_defaulted() -> None:
    """No implicit URL is ever guessed for the sse transport (Part 19's
    --port has no fixed value, so any default would be actively wrong)."""
    env = {TRANSPORT_ENV_VAR: "sse"}

    for _ in range(3):
        with pytest.raises(AgentConfigError):
            get_connection_params(env=env)


def test_sse_transport_with_url_connects_successfully() -> None:
    env = {
        TRANSPORT_ENV_VAR: "sse",
        URL_ENV_VAR: "http://127.0.0.1:8080/mcp",
    }

    params = get_connection_params(env=env)

    assert isinstance(params, SseConnectionParams)
    assert params.url == "http://127.0.0.1:8080/mcp"

    # And the agent as a whole builds cleanly on top of it.
    agent = build_agent(connection_params=params)
    assert agent.name == "minus_tracker_agent"


def test_stdio_is_the_default_transport() -> None:
    """No transport env var set at all → defaults to stdio (Part 20)."""
    params = get_connection_params(env={})

    assert isinstance(params, StdioConnectionParams)


def test_unknown_transport_fails_clearly() -> None:
    env = {TRANSPORT_ENV_VAR: "carrier-pigeon"}

    with pytest.raises(AgentConfigError) as excinfo:
        get_connection_params(env=env)

    assert excinfo.value.code == "UNKNOWN_MCP_TRANSPORT"
