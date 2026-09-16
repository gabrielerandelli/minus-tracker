# minus-tracker-agent

A conversational front-end for [minus-tracker](../README.md), built with Google's
[Agent Development Kit (ADK)](https://google.github.io/adk-docs/). It is a pure MCP client: every
capability it exposes maps 1:1 to a `minus-tracker-mcp` tool call — no tax logic is reimplemented,
no CLI subprocess is shelled out to.

This is a Python subproject, sibling to `../src/` (TypeScript) inside the same repo — not a
separate package. It is **local-install only** in this release: not published to PyPI.

## Quick start

`setup_and_run.sh` sets up and launches the agent in one command. It has two independent choices —
which model, and how it reaches `minus-tracker-mcp` — pick either, both, or neither flag:

| Choice         | Flag                 | If you omit the flag             |
| -------------- | -------------------- | -------------------------------- |
| Model          | `--ollama [model]`   | Anthropic Claude (cloud)         |
| MCP connection | `--mcp-remote <url>` | Builds a local MCP server itself |

```bash
cd minus-tracker/agent

# Anthropic Claude + a local MCP server (the default — no flags needed)
export ANTHROPIC_API_KEY=sk-ant-...
./scripts/setup_and_run.sh

# Local Ollama + a local MCP server — no cloud dependency at all
./scripts/setup_and_run.sh --ollama

# Anthropic Claude + an MCP server already running elsewhere
export ANTHROPIC_API_KEY=sk-ant-...
./scripts/setup_and_run.sh --mcp-remote http://127.0.0.1:8080/mcp

# Local Ollama + an MCP server already running elsewhere
./scripts/setup_and_run.sh --ollama --mcp-remote http://127.0.0.1:8080/mcp
```

`--mcp-remote <url>` sets `MINUS_TRACKER_MCP_TRANSPORT`/`MINUS_TRACKER_MCP_URL` for you — no need
to export them yourself. Everything below is what the script automates, spelled out manually for
when you want more control or are troubleshooting a step.

## Choose your MCP connection: local server or remote

`minus-tracker-mcp` is what actually does the tax-calculation work — the agent is just a client of
it. Two ways to reach it:

|          | **Local (default)**                   | **Remote**                                            |
| -------- | ------------------------------------- | ----------------------------------------------------- |
| What     | The agent builds and spawns it itself | You point the agent at one already running elsewhere  |
| Setup    | `npm ci && npm run build` once        | Set `MINUS_TRACKER_MCP_TRANSPORT=sse` + `..._MCP_URL` |
| Good for | The common case, one machine          | A shared/long-running server, or a different host     |

Pick one, then follow the matching subsection below — or just use Quick start's `--mcp-remote
<url>` flag above to skip straight to Remote.

### Local

```bash
cd minus-tracker              # repo root, sibling to agent/
npm ci && npm run build
export MINUS_TRACKER_MCP_COMMAND="$(pwd)/dist/mcp/index.js"
```

`./scripts/setup_and_run.sh` (no `--mcp-remote` flag) does this for you automatically if
`minus-tracker-mcp` isn't already on `PATH` (and you haven't already set
`MINUS_TRACKER_MCP_COMMAND` yourself — your own value is always respected, never overwritten).
This deliberately skips `npm link`/`npm install -g`: they need write access to npm's global
directory, which isn't guaranteed — a common `npm error EACCES ... symlink ...
/usr/local/lib/node_modules` on Node installs outside a version manager like nvm. Pointing the
agent straight at the built file's own path instead needs no such permission — the file is
executable with its own shebang, so no separate `MINUS_TRACKER_MCP_ARGS` is needed either.

Want a real, PATH-resolvable `minus-tracker-mcp` binary anyway (e.g. to also use it with Claude
Desktop's MCP config)? `npm link` (or `npm install -g .`) does that — hitting the `EACCES` error
above means fixing npm's global prefix once (`npm config set prefix ~/.npm-global`, then add
`~/.npm-global/bin` to `PATH`), or just sticking with the `MINUS_TRACKER_MCP_COMMAND` approach
above, which sidesteps the whole issue.

### Remote

```bash
export MINUS_TRACKER_MCP_TRANSPORT=sse
export MINUS_TRACKER_MCP_URL=http://127.0.0.1:8080/mcp
```

No local build needed — skip the "Local" steps above entirely.

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
model call. Reusing a shell where you'd previously set `MINUS_TRACKER_AGENT_MODEL` (e.g. from
Option B)? `unset MINUS_TRACKER_AGENT_MODEL` first, or it'll silently override this default.

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
Needs `minus-tracker-mcp` reachable — see "Choose your MCP connection" above.

## Configuration

### MCP connection

| Variable                      | Default             | Notes                                                                                                                                                                                               |
| ----------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MINUS_TRACKER_MCP_TRANSPORT` | `stdio`             | `stdio` (local, see "Choose your MCP connection" above) or `sse` (remote)                                                                                                                           |
| `MINUS_TRACKER_MCP_URL`       | _(none)_            | **Required** when the transport is `sse` — no default is guessed, since the server's `--port` has no fixed value                                                                                    |
| `MINUS_TRACKER_MCP_COMMAND`   | `minus-tracker-mcp` | Overrides the stdio spawn command — Quick start sets this to the built `dist/mcp/index.js` path automatically when the binary isn't on `PATH`; your own value, if already set, is never overwritten |
| `MINUS_TRACKER_MCP_ARGS`      | _(none)_            | Space-separated args for the command above, if you need them — not used by anything documented in this README, since a space in the value would be split apart                                      |

```bash
export MINUS_TRACKER_MCP_TRANSPORT=sse
export MINUS_TRACKER_MCP_URL=http://127.0.0.1:8080/mcp
```

Set these before running either `adk run` or `adk web` from "Run" above (or use Quick start's
`--mcp-remote <url>`, which sets them for you).

### Model

| Variable                    | Default           | Notes                                                                                                                     |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `MINUS_TRACKER_AGENT_MODEL` | `claude-sonnet-5` | A `claude-*` id routes to Anthropic directly (Option A); `ollama_chat/<model>` routes to a local Ollama server (Option B) |

Left at its default by Option A (nothing to export). For Option B: exported automatically if you
used the Quick start script; if you followed Option B's manual steps instead, it's whatever you
yourself `export`ed there — this row is just the quick reference, not a guarantee either path set
it for you.

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
