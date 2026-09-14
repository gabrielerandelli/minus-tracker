# minus-tracker-agent

A conversational front-end for [minus-tracker](../README.md), built with Google's
[Agent Development Kit (ADK)](https://google.github.io/adk-docs/). It is a pure MCP client: every
capability it exposes maps 1:1 to a `minus-tracker-mcp` tool call — no tax logic is reimplemented,
no CLI subprocess is shelled out to. See the parent package's `docs/prd/20-adk-agent.md` (private
dev repo) for the full design.

This is a Python subproject, sibling to `../src/` (TypeScript) inside the same repo — not a
separate package. It is **local-install only** in this release: not published to PyPI.

## Install

```bash
cd minus-tracker/agent
pip install -e .          # or: uv sync
```

## Run

```bash
adk run minus_tracker_agent    # terminal chat
adk web                        # local browser dev UI
```

By default the agent spawns `minus-tracker-mcp` locally over stdio — build/install the parent
`minus-tracker` npm package first so that binary is on `PATH` (`npm install -g` from the repo
root, or `npm link`).

## Configuration

| Variable                        | Default | Notes                                                              |
| -------------------------------- | ------- | ------------------------------------------------------------------- |
| `MINUS_TRACKER_MCP_TRANSPORT`    | `stdio` | `stdio` or `sse`                                                     |
| `MINUS_TRACKER_MCP_URL`          | _(none)_ | **Required** when the transport is `sse` — no default is guessed, since the server's `--port` has no fixed value |

```bash
export MINUS_TRACKER_MCP_TRANSPORT=sse
export MINUS_TRACKER_MCP_URL=http://127.0.0.1:8080/mcp
adk run minus_tracker_agent
```

## Tests

```bash
pip install -e ".[dev]"
pytest
```

`tests/test_tool_discovery.py` builds the sibling TypeScript package (`npm run build`, if not
already built) and asserts `MCPToolset` tool discovery matches the running `minus-tracker-mcp`'s
own `tools/list` response exactly — never a hardcoded tool list — plus the `sse`-transport
configuration-error behavior above.

minus-tracker (and, by extension, this agent) is a calculation aid, not tax advice.
