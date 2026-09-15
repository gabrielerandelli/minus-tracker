# minus-tracker-agent

A conversational front-end for [minus-tracker](../README.md), built with Google's
[Agent Development Kit (ADK)](https://google.github.io/adk-docs/). It is a pure MCP client: every
capability it exposes maps 1:1 to a `minus-tracker-mcp` tool call — no tax logic is reimplemented,
no CLI subprocess is shelled out to. See the parent package's `docs/prd/20-adk-agent.md` (private
dev repo) for the full design.

This is a Python subproject, sibling to `../src/` (TypeScript) inside the same repo — not a
separate package. It is **local-install only** in this release: not published to PyPI.

## Choose your model: Anthropic Claude or local Ollama

Before installing, decide which one you want — this agent supports two ways to run:

|               | **Option A: Anthropic Claude (cloud)** | **Option B: Local via Ollama**                    |
| ------------- | -------------------------------------- | ------------------------------------------------- |
| Requires      | an `ANTHROPIC_API_KEY`                 | Ollama installed + a model pulled — no API key    |
| Your data     | prompts go to Anthropic's API          | nothing leaves your machine                       |
| Quality/speed | best available, hosted                 | depends on the model you pull + your own hardware |

Follow the matching section below for install and configuration, then use the shared "Run" section
further down to actually start the agent — both options end up running the exact same `adk`
commands, they just differ in how the model itself is configured.

## Option A: Anthropic Claude (cloud)

```bash
cd minus-tracker/agent
uv sync
source .venv/bin/activate     # do this once per shell session
export ANTHROPIC_API_KEY=sk-ant-...  # or ANTHROPIC_AUTH_TOKEN
```

`claude-sonnet-5` is `MINUS_TRACKER_AGENT_MODEL`'s built-in fallback when the variable is unset —
nothing else to configure for this option. This credential isn't validated until the first real
model call.

## Option B: Local via Ollama

```bash
cd minus-tracker/agent
uv sync
source .venv/bin/activate     # do this once per shell session
./scripts/setup_ollama.sh     # installs the ollama extra, checks/installs Ollama, pulls a model — defaults to gemma4:e2b
export MINUS_TRACKER_AGENT_MODEL=ollama_chat/gemma4:e2b
```

Make sure Ollama is running (`ollama serve`, or the app/service) before you run the agent below.
Manual equivalent, if you'd rather not run the script: `uv sync --extra ollama` (or
`pip install -e ".[ollama]"`), install and start Ollama yourself, `ollama pull gemma4:e2b`, then
set the env var above — don't run the script _and_ one of these by hand, they install the same
thing. `OLLAMA_API_BASE` (LiteLLM's own env var, default `http://localhost:11434`) points at a
non-default Ollama address if needed. An `ImportError` mentioning LiteLLM means the `ollama` extra
isn't installed — use one of the two install paths above.

## Install notes

`uv sync` installs `adk` into a **project-local virtualenv** (`agent/.venv`) — it does not touch
your shell's `PATH` on its own. Activating it (as shown above) puts `adk` on `PATH` for the rest
of that shell session, so every command below works as written with no per-command prefix. Forget
to activate and you'll hit `command not found: adk` right after a successful `uv sync` — that's
this PATH gap, not a broken install; either run `source .venv/bin/activate` (once; re-run it in
each new terminal tab/session) or prefix one-off commands with `uv run` instead.

Prefer `pip`? `pip install -e .` (Option A) or `pip install -e ".[ollama]"` (Option B) work too,
but install into whatever Python environment is already active rather than creating `.venv` for
you — create and activate your own first (`python3 -m venv .venv && source .venv/bin/activate`)
if you want the same setup as above.

## Run

```bash
adk run minus_tracker_agent    # terminal chat
adk web                        # local browser dev UI
```

(Not activated? Same commands work via `uv run adk run minus_tracker_agent` / `uv run adk web`.)

By default the agent spawns `minus-tracker-mcp` locally over stdio — build/install the parent
`minus-tracker` npm package first so that binary is on `PATH` (`npm install -g` from the repo
root, or `npm link`).

## Configuration

| Variable                      | Default           | Notes                                                                                                                     |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `MINUS_TRACKER_MCP_TRANSPORT` | `stdio`           | `stdio` or `sse`                                                                                                          |
| `MINUS_TRACKER_MCP_URL`       | _(none)_          | **Required** when the transport is `sse` — no default is guessed, since the server's `--port` has no fixed value          |
| `MINUS_TRACKER_AGENT_MODEL`   | `claude-sonnet-5` | A `claude-*` id routes to Anthropic directly (Option A); `ollama_chat/<model>` routes to a local Ollama server (Option B) |

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
own `tools/list` response exactly — never a hardcoded tool list — plus the guaranteed-baseline-tool
and `sse`-transport configuration-error checks described in that file's own module docstring. Each
test carries a `tc249`/`tc251` marker (`pyproject.toml`) so `pytest -m tc249`/`-m tc251` selects
exactly one TC's tests; `npm test` at the repo root also runs this suite by that same selection,
via `test/mcp/adk-agent.test.ts` — a thin vitest bridge that bootstraps `agent/.venv` on first run.

minus-tracker (and, by extension, this agent) is a calculation aid, not tax advice.
