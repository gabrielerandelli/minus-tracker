"""minus-tracker ADK agent — a pure MCPToolset client (PRD Part 20).

No tax logic lives here, and none is reimplemented: every capability this
agent exposes maps 1:1 onto a `minus-tracker-mcp` tool call
(PRD Part 15 + Part 19). Tools are not hand-written wrappers — `McpToolset`
auto-derives one ADK tool per MCP tool from the server's own `tools/list`
response, so this file has zero bespoke tool-calling code to keep in sync as
the server's tool surface evolves.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.tools.mcp_tool import McpToolset

from .connection import build_connection_params

AGENT_NAME = "minus_tracker_agent"

AGENT_DESCRIPTION = (
    "Calculates Italian capital-gains/losses (plusvalenze/minusvalenze) for "
    "the Regime Dichiarativo from a broker export, via the minus-tracker "
    "MCP server."
)

AGENT_INSTRUCTION = (
    "You help a user compute Italian capital-gains/losses "
    "(plusvalenze/minusvalenze) for the Regime Dichiarativo by calling the "
    "minus-tracker-mcp tools — you have no tax logic of your own. This is a "
    "calculation aid, not tax advice: say so when presenting a result. "
    "Never invent a figure; every number you report must come from a tool "
    "call's result. Prefer `calculate_from_csv` for the common case "
    "(including a correction retry via its `overrides` field); fall back to "
    "the granular `parse_transactions` -> `classify_instruments` -> "
    "`calculate_gains` chain only for a long multi-ISIN correction session, "
    "to avoid re-querying OpenFIGI for already-resolved ISINs on every "
    "retry."
)


def build_agent() -> LlmAgent:
    """Constructs the single root `LlmAgent`, wired to `minus-tracker-mcp`.

    Model is left at ADK's own default (Gemini) — deliberately not
    hardcoded here, so it stays configurable via ADK's usual mechanisms
    (see PRD Part 20's "Agent Design").

    Raises:
      AgentConfigError: see `connection.build_connection_params` — a
        misconfigured transport/URL fails construction immediately rather
        than silently guessing.
    """
    return LlmAgent(
        name=AGENT_NAME,
        description=AGENT_DESCRIPTION,
        instruction=AGENT_INSTRUCTION,
        tools=[McpToolset(connection_params=build_connection_params())],
    )


# ADK's own tooling (`adk run`, `adk web`) imports this module and reads
# `root_agent` synchronously at import time — construction must not be
# deferred behind an async call (see the `google-agents-cli-adk-code`
# skill's "Gotchas").
root_agent = build_agent()
