"""minus-tracker ADK agent — a pure MCPToolset client.

A single `LlmAgent`, per docs/prd/20-adk-agent.md: no sub-agent
orchestration, no hand-written tool wrappers. `MCPToolset` connects to a
`minus-tracker-mcp` instance and auto-derives one ADK tool per MCP tool
from the server's own `tools/list` response, so this file carries zero
bespoke tool-calling code to keep in sync as the server's tool surface
grows (Part 15 + Part 19's `calculate_from_csv`/`check_rate_coverage`).

Every capability maps 1:1 onto a minus-tracker-mcp tool call — no tax
logic is reimplemented here. minus-tracker (and, by extension, this
agent) is a calculation aid, not tax advice.
"""

from __future__ import annotations

from typing import Optional, Union

# `MCPToolset` is the name Part 20 of the PRD specifies; the installed ADK
# version aliases it to `McpToolset` (the older name is a deprecated shim
# that just emits a DeprecationWarning and forwards). Import the
# non-deprecated symbol under the PRD's name so the rest of this module —
# and anything reading it — matches the spec without tripping that
# warning on every import.
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset as MCPToolset
from google.adk.agents.llm_agent import Agent
from google.adk.models.base_llm import BaseLlm

from .config import ConnectionParams, get_connection_params, get_model

AGENT_NAME = "minus_tracker_agent"

AGENT_DESCRIPTION = (
    "Conversational front-end for minus-tracker Italian capital-gains/loss "
    "calculations (Regime Dichiarativo)."
)

# minus-tracker is a calculation aid, not tax advice (AGENTS.md) — the
# instruction keeps that framing in the agent's own responses, and directs
# every capability through the MCP tools rather than free-form estimation.
AGENT_INSTRUCTION = (
    "You are a conversational assistant for Italian capital-gains/loss tax "
    "calculations (Regime Dichiarativo), backed by the minus-tracker MCP "
    "tools. Always compute figures by calling a tool — never estimate or "
    "invent a tax result yourself. When a CSV export needs to be turned "
    "into plusvalenze/minusvalenze, prefer `calculate_from_csv` (one call "
    "covers the common case, including a correction retry via its "
    "`overrides` field); fall back to the granular "
    "`parse_transactions`/`classify_instruments`/`calculate_gains` chain "
    "only for a long, multi-ISIN correction session. Always make clear "
    "that results are a calculation aid, not tax advice."
)


def build_toolset(connection_params: Optional[ConnectionParams] = None) -> MCPToolset:
    """Build the MCPToolset wired to the configured minus-tracker-mcp transport.

    Args:
        connection_params: override the environment-derived connection
            (`MINUS_TRACKER_MCP_TRANSPORT`/`MINUS_TRACKER_MCP_URL`, see
            `minus_tracker_agent.config`) — used by tests that need to
            point at a specific local server instance rather than
            whatever is on PATH.
    """
    return MCPToolset(
        connection_params=connection_params or get_connection_params(),
    )


def build_agent(
    connection_params: Optional[ConnectionParams] = None,
    model: Optional[Union[str, BaseLlm]] = None,
) -> Agent:
    """Construct the `LlmAgent`.

    Defaults to Anthropic Claude (`MINUS_TRACKER_AGENT_MODEL`, see
    `minus_tracker_agent.config.get_model`) rather than ADK's own Gemini
    default. Pass `model` to override with a specific model id or a
    `BaseLlm` instance (see `tests/test_smoke.py`'s scripted `_ScriptedLlm`).
    """
    return Agent(
        name=AGENT_NAME,
        description=AGENT_DESCRIPTION,
        instruction=AGENT_INSTRUCTION,
        model=model or get_model(),
        tools=[build_toolset(connection_params)],
    )


# ADK's own dev tooling (`adk run`/`adk web`, Part 20's Interaction
# Surface) discovers the agent via this module-level `root_agent`, per the
# `agents-cli scaffold create` convention this subproject follows.
root_agent = build_agent()
