"""MCP connection and model configuration for the minus-tracker ADK agent.

Reads the environment variables Part 19/20 of the PRD define
(docs/prd/19-mcp-server-extensions.md, docs/prd/20-adk-agent.md):

- ``MINUS_TRACKER_MCP_TRANSPORT`` — ``"stdio"`` (default) or ``"sse"``.
- ``MINUS_TRACKER_MCP_URL`` — required when the transport is ``"sse"``,
  no default value. Part 19's ``--port <n>`` has no fixed port, so a
  guessed URL would be actively wrong, not just permissive — this module
  never invents one.
- ``MINUS_TRACKER_AGENT_MODEL`` — the LLM model id (default:
  ``"claude-sonnet-5"``, Anthropic). Also accepts ``"ollama_chat/<model>"``
  to use a local model via a running Ollama server, requiring the
  ``ollama`` extra (``uv sync --extra ollama`` or
  ``pip install -e ".[ollama]"``); see README.md's "Option B: Local via
  Ollama" and ``scripts/setup_ollama.sh`` for one-command setup.
  ``OLLAMA_API_BASE`` (LiteLLM's own env var, default
  ``http://localhost:11434``) points at a non-default Ollama address.
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


MODEL_ENV_VAR = "MINUS_TRACKER_AGENT_MODEL"
DEFAULT_MODEL = "claude-sonnet-5"


def get_model(env: Optional[Mapping[str, str]] = None) -> str:
    """Resolve the LLM model id from the environment.

    Returns a plain model-id string. Note this is deliberately NOT what
    ADK's own model registry would resolve a bare ``claude-*`` string to
    (that maps to ``anthropic_llm.Claude``, a Vertex-AI-only subclass) — see
    ``agent.build_agent``, which wraps a ``claude-*`` string in the
    direct-API ``AnthropicLlm`` base class explicitly before it ever reaches
    `Agent`, rather than relying on the registry's default routing. No
    validation beyond that here: an invalid/unsupported model id is ADK's
    own registry's or the Anthropic SDK's error to raise (lazily, on the
    first real LLM call), not a case this module invents error-handling for
    — unlike ``MINUS_TRACKER_MCP_TRANSPORT``, nothing downstream already
    validates an unknown transport string, which is why that one *does*
    raise ``AgentConfigError`` and this one deliberately doesn't.

    An explicitly-set but empty/whitespace-only value falls back to
    ``DEFAULT_MODEL`` too, the same as leaving the variable unset — matching
    ``get_connection_params``'s own transport lookup, where an empty string
    can never silently pass through as a distinct "value" (it falls into
    that function's "unknown transport" error branch instead of bypassing
    the default).
    """
    env = os.environ if env is None else env
    return env.get(MODEL_ENV_VAR, "").strip() or DEFAULT_MODEL
