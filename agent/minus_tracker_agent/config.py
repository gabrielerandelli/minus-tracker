"""MCP connection configuration for the minus-tracker ADK agent.

Reads the two environment variables Part 19/20 of the PRD define
(docs/prd/19-mcp-server-extensions.md, docs/prd/20-adk-agent.md):

- ``MINUS_TRACKER_MCP_TRANSPORT`` — ``"stdio"`` (default) or ``"sse"``.
- ``MINUS_TRACKER_MCP_URL`` — required when the transport is ``"sse"``,
  no default value. Part 19's ``--port <n>`` has no fixed port, so a
  guessed URL would be actively wrong, not just permissive — this module
  never invents one.
"""

from __future__ import annotations

import os
from typing import Mapping, Optional, Union

from google.adk.tools.mcp_tool.mcp_session_manager import (
    SseConnectionParams,
    StdioConnectionParams,
)
from mcp import StdioServerParameters

from .errors import AgentConfigError

TRANSPORT_ENV_VAR = "MINUS_TRACKER_MCP_TRANSPORT"
URL_ENV_VAR = "MINUS_TRACKER_MCP_URL"

TRANSPORT_STDIO = "stdio"
TRANSPORT_SSE = "sse"

# The default stdio command relies on `minus-tracker-mcp` being resolvable
# on PATH — true for a real install (`pip install -e .` alongside `npm
# install`/a global npm link of the parent package, per Part 20's
# Installation section) or when a caller overrides it via
# `MINUS_TRACKER_MCP_COMMAND`/`MINUS_TRACKER_MCP_ARGS` below (used by this
# repo's own test suite, which spawns the freshly-built `dist/mcp/index.js`
# directly rather than relying on a global PATH install).
DEFAULT_STDIO_COMMAND = "minus-tracker-mcp"

COMMAND_ENV_VAR = "MINUS_TRACKER_MCP_COMMAND"
COMMAND_ARGS_ENV_VAR = "MINUS_TRACKER_MCP_ARGS"

# A real type alias (not a string) so `typing.get_type_hints()`/tooling that
# resolves annotations sees an actual Union, not an opaque forward-reference
# string that never gets evaluated — `from __future__ import annotations`
# above already makes this module's own runtime behavior indifferent to the
# distinction, but nothing else reading this module's annotations should pay
# for that indifference too.
ConnectionParams = Union[StdioConnectionParams, SseConnectionParams]


def get_connection_params(
    env: Optional[Mapping[str, str]] = None,
) -> ConnectionParams:
    """Resolve MCPToolset connection params from the environment.

    Raises:
        AgentConfigError: transport is unrecognized, or is ``"sse"`` with
            no ``MINUS_TRACKER_MCP_URL`` set.
    """
    env = os.environ if env is None else env
    transport = env.get(TRANSPORT_ENV_VAR, TRANSPORT_STDIO).strip().lower()

    if transport == TRANSPORT_STDIO:
        command = env.get(COMMAND_ENV_VAR, DEFAULT_STDIO_COMMAND)
        raw_args = env.get(COMMAND_ARGS_ENV_VAR, "")
        args = raw_args.split() if raw_args else []
        return StdioConnectionParams(
            server_params=StdioServerParameters(command=command, args=args),
        )

    if transport == TRANSPORT_SSE:
        url = env.get(URL_ENV_VAR)
        if not url:
            raise AgentConfigError(
                "MISSING_MCP_URL",
                f"{URL_ENV_VAR} is required when {TRANSPORT_ENV_VAR}="
                f"{TRANSPORT_SSE!r} — Part 19's --port has no fixed default, "
                "so no URL can be guessed. Set it to the running "
                "minus-tracker-mcp instance, e.g. http://127.0.0.1:8080/mcp.",
            )
        return SseConnectionParams(url=url)

    raise AgentConfigError(
        "UNKNOWN_MCP_TRANSPORT",
        f"Unknown {TRANSPORT_ENV_VAR}={transport!r} — expected "
        f"{TRANSPORT_STDIO!r} or {TRANSPORT_SSE!r}.",
    )
