# minus-tracker-agent

A conversational ADK (Agent Development Kit) front-end for
[minus-tracker](../README.md). See
[`docs/prd/20-adk-agent.md`](../../docs/prd/20-adk-agent.md) in the private
`minus-tracker-dev` repo for the full spec.

This is a pure MCP client: every capability it exposes maps 1:1 onto a
`minus-tracker-mcp` tool call — no tax logic is reimplemented here, and none
is expected to be. Tools are not hand-written wrappers either: ADK's
`McpToolset` auto-derives one tool per MCP tool from the server's own
`tools/list` response.

## Install (local checkout only — no PyPI package in v0.13.0)

```bash
cd minus-tracker/agent
pip install -e '.[dev]'   # or: uv sync
adk run minus_tracker_agent
```

## Connecting to `minus-tracker-mcp`

Connection target is environment-configured, never hardcoded:

| Variable                     | Default              | Meaning                                                                                |
| ----------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `MINUS_TRACKER_MCP_TRANSPORT` | `stdio`               | `stdio` (spawn locally) or `sse`                                                          |
| `MINUS_TRACKER_MCP_URL`       | _(none)_              | **Required** when transport is `sse` — Part 19's `--port <n>` has no fixed port, so this is never guessed |
| `MINUS_TRACKER_MCP_COMMAND`   | `minus-tracker-mcp`   | stdio only. Override for a checkout where the bin isn't on PATH, e.g. `node`              |
| `MINUS_TRACKER_MCP_ARGS`      | _(none)_              | stdio only, shell-quoted, e.g. `dist/mcp/index.js` when `COMMAND=node`                    |

```bash
# Default: spawn `minus-tracker-mcp` from PATH over stdio — zero setup.
adk run minus_tracker_agent

# Remote / already-running server over SSE (Part 19):
MINUS_TRACKER_MCP_TRANSPORT=sse \
MINUS_TRACKER_MCP_URL=http://127.0.0.1:8080/mcp \
  adk run minus_tracker_agent

# Unlinked local checkout of the TypeScript package (no global bin):
MINUS_TRACKER_MCP_COMMAND=node \
MINUS_TRACKER_MCP_ARGS=../dist/mcp/index.js \
  adk run minus_tracker_agent
```

## Testing

```bash
pip install -e '.[dev]'
pytest
```

`tests/test_tool_discovery.py` builds the sibling TypeScript package
(`npm run build`, once per test session) if `dist/` is missing, then spawns
`minus-tracker-mcp` over stdio to verify `McpToolset` discovery matches the
server's own `tools/list` response exactly, and that an `sse` transport with
no URL configured fails construction with a clear error instead of guessing
one.
