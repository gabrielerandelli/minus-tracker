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

| Variable                      | Default           | Notes                                                                                                            |
| ----------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `MINUS_TRACKER_MCP_TRANSPORT` | `stdio`           | `stdio` or `sse`                                                                                                 |
| `MINUS_TRACKER_MCP_URL`       | _(none)_          | **Required** when the transport is `sse` — no default is guessed, since the server's `--port` has no fixed value |
| `MINUS_TRACKER_AGENT_MODEL`   | `claude-sonnet-5` | Any ADK-recognized model id — a `claude-*` id routes to Anthropic directly                                       |

```bash
export MINUS_TRACKER_MCP_TRANSPORT=sse
export MINUS_TRACKER_MCP_URL=http://127.0.0.1:8080/mcp
adk run minus_tracker_agent
```

Uses Anthropic Claude by default — set `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`) in the
environment before running `adk run`/`adk web`; unlike the MCP connection, this credential isn't
validated until the first real model call.

## Optional: Local Model via Ollama

By default this agent uses Anthropic Claude (see Configuration above). You can instead point it at
a model running locally via [Ollama](https://ollama.com) — fully optional, adds one extra
dependency (`litellm`) only if you opt in; the default Claude path never needs it.

Quick setup (installs the extra, checks/guides installing Ollama, pulls the model):

```bash
cd minus-tracker/agent
./scripts/setup_ollama.sh          # defaults to gemma4:e2b
```

Then:

```bash
export MINUS_TRACKER_AGENT_MODEL=ollama_chat/gemma4:e2b
adk run minus_tracker_agent
```

Manual equivalent, if you'd rather not run the script: `pip install -e ".[ollama]"`, install and
start Ollama yourself, `ollama pull gemma4:e2b`, then set the env var above.

`OLLAMA_API_BASE` (LiteLLM's own env var, default `http://localhost:11434`) points at a
non-default Ollama address if needed.

If you see an `ImportError` mentioning LiteLLM, you're using an `ollama_chat/*`/`ollama/*` model
without the extra installed — run the setup script or `pip install -e ".[ollama]"`.

## Tests

```bash
pip install -e ".[dev]"
pytest
```

`tests/test_tool_discovery.py` builds the sibling TypeScript package (`npm run build`, if not
already built) and asserts `MCPToolset` tool discovery matches the running `minus-tracker-mcp`'s
own `tools/list` response exactly — never a hardcoded tool list — plus the guaranteed-baseline-tool
and `sse`-transport configuration-error checks described in that file's own module docstring. Each
test carries a `tc249`/`tc251` marker (`pyproject.toml`) so `pytest -m tc249`/`-m tc251` selects
exactly one TC's tests; `npm test` at the repo root also runs this suite by that same selection,
via `test/mcp/adk-agent.test.ts` — a thin vitest bridge that bootstraps `agent/.venv` on first run.

minus-tracker (and, by extension, this agent) is a calculation aid, not tax advice.
