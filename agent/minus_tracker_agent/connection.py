"""MCP connection configuration for the minus-tracker ADK agent.

Every value is environment-driven (PRD Part 20's "MCP Connection" section) so
the exact same agent code runs unmodified against a locally-spawned
`minus-tracker-mcp` (the default, stdio) or a remote instance started with
`--transport sse` (PRD Part 19) — no code change, no hardcoded endpoint.
"""

from __future__ import annotations

import os
import shlex
from typing import Mapping, Union

from google.adk.tools.mcp_tool.mcp_session_manager import (
    SseConnectionParams,
    StdioConnectionParams,
)
from mcp import StdioServerParameters

#: Selects the transport: "stdio" (default) or "sse".
TRANSPORT_ENV_VAR = "MINUS_TRACKER_MCP_TRANSPORT"
#: Required when TRANSPORT_ENV_VAR="sse" — deliberately has no default, see
#: AgentConfigError below.
URL_ENV_VAR = "MINUS_TRACKER_MCP_URL"
#: stdio only. Defaults to the published bin name, matching every other MCP
#: client of this server (PRD Part 20); override for a local checkout where
#: `minus-tracker-mcp` isn't on PATH (e.g. `node`).
COMMAND_ENV_VAR = "MINUS_TRACKER_MCP_COMMAND"
#: stdio only, shell-quoted, e.g. "dist/mcp/index.js" when COMMAND is "node".
ARGS_ENV_VAR = "MINUS_TRACKER_MCP_ARGS"

STDIO_TRANSPORT = "stdio"
SSE_TRANSPORT = "sse"
SUPPORTED_TRANSPORTS = (STDIO_TRANSPORT, SSE_TRANSPORT)

DEFAULT_TRANSPORT = STDIO_TRANSPORT
DEFAULT_COMMAND = "minus-tracker-mcp"

ConnectionParams = Union[StdioConnectionParams, SseConnectionParams]


class AgentConfigError(RuntimeError):
    """The agent's MCP connection is misconfigured.

    Mirrors this repo's TypeScript error-code convention (`src/errors.ts`):
    a small, closed set of string `code`s a caller can branch on, not just a
    human-readable message.

    Raised instead of guessing a default (e.g. an SSE URL) so a bad
    configuration fails immediately and legibly at agent-construction time,
    rather than connecting to the wrong place or hanging.
    """

    code: str

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


def build_connection_params(env: Mapping[str, str] | None = None) -> ConnectionParams:
    """Builds `McpToolset` connection params from the environment.

    Args:
      env: Mapping to read configuration from. Defaults to `os.environ`.

    Returns:
      `StdioConnectionParams` for the default `stdio` transport, or
      `SseConnectionParams` for `sse`.

    Raises:
      AgentConfigError: `MINUS_TRACKER_MCP_TRANSPORT=sse` but
        `MINUS_TRACKER_MCP_URL` is unset, or the transport value isn't one
        of `SUPPORTED_TRANSPORTS`.
    """
    env = os.environ if env is None else env
    transport = env.get(TRANSPORT_ENV_VAR, DEFAULT_TRANSPORT)

    if transport == SSE_TRANSPORT:
        url = env.get(URL_ENV_VAR)
        if not url:
            raise AgentConfigError(
                "MISSING_MCP_URL",
                f"{URL_ENV_VAR} must be set when {TRANSPORT_ENV_VAR}={SSE_TRANSPORT!r} "
                "— Part 19's `--port <n>` has no fixed default, so no URL is "
                "ever guessed. Set it to the running "
                "`minus-tracker-mcp --transport sse` instance's address, e.g. "
                "http://127.0.0.1:8080/mcp.",
            )
        return SseConnectionParams(url=url)

    if transport != STDIO_TRANSPORT:
        raise AgentConfigError(
            "UNSUPPORTED_TRANSPORT",
            f"Unsupported {TRANSPORT_ENV_VAR}={transport!r} — expected one of "
            f"{SUPPORTED_TRANSPORTS!r}.",
        )

    command = env.get(COMMAND_ENV_VAR, DEFAULT_COMMAND)
    raw_args = env.get(ARGS_ENV_VAR)
    args = shlex.split(raw_args) if raw_args else []
    return StdioConnectionParams(
        server_params=StdioServerParameters(command=command, args=args),
    )
