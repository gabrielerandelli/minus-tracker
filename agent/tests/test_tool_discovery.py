"""TC-249, TC-251 — MCPToolset wiring (docs/prd/20-adk-agent.md, Task 68).

TC-249: `MCPToolset` tool discovery against a running `minus-tracker-mcp`
(stdio) instance resolves to exactly the server's own `tools/list`
response — asserted by comparing against a raw MCP client session's
`list_tools()` result, never a hardcoded expected tool list, so this test
doesn't drift when Part 19 tools (`calculate_from_csv`,
`check_rate_coverage`) land.

TC-251: `MINUS_TRACKER_MCP_TRANSPORT=sse` with no `MINUS_TRACKER_MCP_URL`
fails with a clear configuration error rather than a silent default; with
the URL set, connection params build successfully. Task 68 does not
depend on Task 67 (the SSE transport itself) — per the impl plan's
Dependency Order, it defaults to stdio — so this test covers the agent's
own config validation, not a live SSE round-trip.
"""

from __future__ import annotations

from typing import List, Tuple

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


async def _raw_server_tool_names(command: str, args: List[str]) -> List[str]:
    """Ground truth: the server's own `tools/list` response, via a plain
    MCP client session — no ADK involved."""
    params = StdioServerParameters(command=command, args=args)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.list_tools()
            return sorted(tool.name for tool in result.tools)


# --- TC-249 ------------------------------------------------------------


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


# --- TC-251 --------------------------------------------------------------


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
