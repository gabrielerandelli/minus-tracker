"""TC-249, TC-251 — `LlmAgent` + `MCPToolset` wiring (impl_plan.md Task 68).

TC-249: MCPToolset tool discovery resolves to exactly the server's own
`tools/list` response — independent of any LLM call, and asserted against
whatever the server actually exposes right now rather than a hardcoded tool
list, so this test can never silently drift from the server's real surface
(see impl_plan.md's Task 68 implementation notes).

TC-251: MINUS_TRACKER_MCP_TRANSPORT=sse with no MINUS_TRACKER_MCP_URL set
fails agent construction with a clear configuration error — Part 19's
`--port <n>` has no fixed port, so guessing one would be actively wrong.
"""

from __future__ import annotations

import pytest
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from minus_tracker_agent.agent import build_agent
from minus_tracker_agent.connection import (
    SSE_TRANSPORT,
    TRANSPORT_ENV_VAR,
    URL_ENV_VAR,
    AgentConfigError,
    build_connection_params,
)


async def _live_tool_names(server_params: StdioServerParameters) -> set[str]:
    """The server's own `tools/list` response, queried directly with the raw
    MCP SDK — the ground truth TC-249 checks ADK's discovery against."""
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.list_tools()
            return {tool.name for tool in result.tools}


def _sole_toolset(agent) -> McpToolset:
    toolsets = [tool for tool in agent.tools if isinstance(tool, McpToolset)]
    assert len(toolsets) == 1, "expected exactly one McpToolset on the agent"
    return toolsets[0]


class TestToolDiscovery:
    """TC-249."""

    @pytest.mark.usefixtures("mcp_stdio_env")
    async def test_agent_construction_succeeds(self):
        agent = build_agent()
        toolset = _sole_toolset(agent)
        try:
            tools = await toolset.get_tools()
        finally:
            await toolset.close()
        assert tools, "discovery returned zero tools — is the server running?"

    async def test_discovered_tools_match_server_exactly(
        self, mcp_stdio_env, mcp_server_entry
    ):
        agent = build_agent()
        toolset = _sole_toolset(agent)
        try:
            discovered = await toolset.get_tools()
        finally:
            await toolset.close()

        discovered_names = [tool.name for tool in discovered]
        live_names = await _live_tool_names(
            StdioServerParameters(command="node", args=[str(mcp_server_entry)])
        )

        assert set(discovered_names) == live_names
        assert len(discovered_names) == len(live_names), (
            "duplicate tool name in ADK's discovery — not a 1:1 map of the "
            "server's tools/list response"
        )


class TestSseUrlRequired:
    """TC-251."""

    def test_sse_without_url_fails_with_clear_config_error(self, monkeypatch):
        monkeypatch.setenv(TRANSPORT_ENV_VAR, SSE_TRANSPORT)
        monkeypatch.delenv(URL_ENV_VAR, raising=False)

        with pytest.raises(AgentConfigError) as excinfo:
            build_agent()

        # A closed error `code`, not just a message a caller would have to
        # string-match (matches src/errors.ts's discriminated-code
        # convention) — and no ValueError/pydantic ValidationError leaking
        # out of SseConnectionParams instead, which would read as "the URL
        # is malformed" rather than "no URL was configured at all".
        assert excinfo.value.code == "MISSING_MCP_URL"
        assert URL_ENV_VAR in str(excinfo.value)

    def test_sse_with_url_set_connects_successfully(self, monkeypatch):
        url = "http://127.0.0.1:8080/mcp"
        monkeypatch.setenv(TRANSPORT_ENV_VAR, SSE_TRANSPORT)
        monkeypatch.setenv(URL_ENV_VAR, url)

        params = build_connection_params()
        assert isinstance(params, SseConnectionParams)
        assert params.url == url

        # Construction must not raise once a URL is configured. The actual
        # MCP session (and any real network I/O) is established lazily on
        # the toolset's first tool call, not at agent-construction time —
        # covered against a live SSE `minus-tracker-mcp` instance by Part
        # 19's own transport tests (TC-246–248), not re-tested here.
        agent = build_agent()
        assert agent.name == "minus_tracker_agent"
