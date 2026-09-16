#!/usr/bin/env bash
# One-command setup + launch: builds minus-tracker-mcp (unless told to use a
# remote one instead), installs the agent's dependencies, configures the
# model, and launches `adk web`. See README.md's "Quick start" section.
#
# The local build never needs `npm link`/a global install — it points the
# agent straight at the built dist/mcp/index.js instead, so it can't hit the
# common `npm error EACCES ... /usr/local/lib/node_modules` permission trap.
#
# Two independent choices — combine them freely:
#
#   Model          --ollama [model]    Anthropic Claude (cloud) if omitted
#   MCP connection --mcp-remote <url>  builds a local server if omitted
#
# Usage:
#   ./scripts/setup_and_run.sh                                      # Claude + local MCP (the default)
#   ./scripts/setup_and_run.sh --ollama [model]                     # Ollama  + local MCP
#   ./scripts/setup_and_run.sh --mcp-remote <url>                   # Claude + remote MCP
#   ./scripts/setup_and_run.sh --ollama [model] --mcp-remote <url>  # Ollama  + remote MCP
#
# Anthropic mode needs ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) set.
# --mcp-remote sets MINUS_TRACKER_MCP_TRANSPORT/MINUS_TRACKER_MCP_URL for
# you — no need to export them yourself (though it still works if you did).
set -euo pipefail
source "$(dirname "$0")/_defaults.sh"
cd "$(dirname "$0")/.."   # agent/

MODE="anthropic"
OLLAMA_MODEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ollama)
      MODE="ollama"
      shift
      # Optional model name: only consume it if present and not itself a flag.
      if [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; then
        OLLAMA_MODEL="$1"
        shift
      fi
      ;;
    --mcp-remote)
      shift
      # Unlike --ollama's optional model, the URL here is mandatory — reject
      # a missing value *or* one that looks like another flag (e.g. a typo'd
      # flag order swallowing "--ollama" as if it were the URL).
      if [ $# -eq 0 ] || [ "${1#--}" != "$1" ]; then
        echo "ERROR: --mcp-remote requires a URL argument (e.g. http://127.0.0.1:8080/mcp)." >&2
        exit 1
      fi
      export MINUS_TRACKER_MCP_TRANSPORT=sse
      export MINUS_TRACKER_MCP_URL="$1"
      shift
      ;;
    *)
      echo "ERROR: unrecognized argument '$1' — expected '--ollama [model]' and/or '--mcp-remote <url>'." >&2
      exit 1
      ;;
  esac
done

# Normalize the same way config.py's get_connection_params() does: the
# default only applies when the variable is truly unset — "${VAR-default}",
# not "${VAR:-default}" — since Python's env.get(KEY, default) only falls
# back on a missing key, not an explicitly empty one. Trimmed by hand (no
# xargs/subprocess) so a stray quote character in the value can't crash this
# line by being parsed as a shell word.
_transport_raw="${MINUS_TRACKER_MCP_TRANSPORT-stdio}"
_transport_raw="${_transport_raw#"${_transport_raw%%[![:space:]]*}"}"
_transport_raw="${_transport_raw%"${_transport_raw##*[![:space:]]}"}"
TRANSPORT="$(printf '%s' "$_transport_raw" | tr '[:upper:]' '[:lower:]')"

# Same trim for the URL — covers both a whitespace-only value passed via
# --mcp-remote and one exported manually, so a blank value fails clearly
# here instead of surfacing as an opaque connection error deep inside `adk`.
_url_raw="${MINUS_TRACKER_MCP_URL-}"
_url_raw="${_url_raw#"${_url_raw%%[![:space:]]*}"}"
MCP_URL="${_url_raw%"${_url_raw##*[![:space:]]}"}"

# Fail fast: check required config before doing any real work below.
if [ "$TRANSPORT" != "stdio" ] && [ "$TRANSPORT" != "sse" ]; then
  echo "ERROR: Unknown MINUS_TRACKER_MCP_TRANSPORT='$TRANSPORT' — expected 'stdio' or 'sse'." >&2
  exit 1
fi
if [ "$MODE" = "anthropic" ] && [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
  echo "ERROR: ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) is not set." >&2
  echo "Export one of those, or re-run with --ollama for a fully local setup instead." >&2
  exit 1
fi
if [ "$TRANSPORT" = "sse" ] && [ -z "$MCP_URL" ]; then
  echo "ERROR: MINUS_TRACKER_MCP_TRANSPORT=sse requires MINUS_TRACKER_MCP_URL too" >&2
  echo "(e.g. http://127.0.0.1:8080/mcp) — no default is guessed, since --port has none." >&2
  exit 1
fi
[ -n "$MCP_URL" ] && export MINUS_TRACKER_MCP_URL="$MCP_URL"   # re-export trimmed

echo "==> Checking minus-tracker-mcp..."
if [ "$TRANSPORT" = "sse" ]; then
  echo "    Remote MCP server: $MINUS_TRACKER_MCP_URL — skipping local build."
elif [ -n "${MINUS_TRACKER_MCP_COMMAND:-}" ]; then
  # Respect an override the user already set themselves — never clobber it,
  # same principle as the MINUS_TRACKER_AGENT_MODEL handling below.
  echo "    using your own MINUS_TRACKER_MCP_COMMAND: $MINUS_TRACKER_MCP_COMMAND"
elif command -v minus-tracker-mcp >/dev/null 2>&1; then
  # PATH check only, not a freshness check — if you've since pulled new
  # minus-tracker source, rebuild (`npm run build` from the repo root)
  # yourself to pick up the changes.
  echo "    found on PATH: $(command -v minus-tracker-mcp)"
else
  # Deliberately NOT `npm link`/`npm install -g` here: that needs write
  # access to npm's global directory, which isn't guaranteed (a common
  # `npm error EACCES ... symlink ... /usr/local/lib/node_modules` on
  # non-nvm Node installs). Instead this points the agent straight at the
  # freshly-built dist/mcp/index.js's own path via MINUS_TRACKER_MCP_COMMAND
  # alone — no MINUS_TRACKER_MCP_ARGS, since config.py's get_connection_params()
  # splits that on whitespace, which would break on any repo checkout path
  # containing a space (a real, common case: "John Smith", iCloud Drive,
  # "OneDrive - Company", etc.). The built file is executable with its own
  # `#!/usr/bin/env node` shebang, so invoking it directly needs no args at
  # all — the OS's own exec mechanism handles the shebang, never a shell
  # word-split, so a space in the path can't break it.
  DIST_MCP_ENTRY="$(cd .. && pwd)/dist/mcp/index.js"
  if [ -f "$DIST_MCP_ENTRY" ]; then
    # Already built from a previous run — reuse it rather than paying for a
    # fresh `npm ci` (which wipes and reinstalls node_modules) every single
    # invocation. Existence check only, same as agent/tests/conftest.py's
    # mcp_server_command fixture — not a freshness check: if you've since
    # pulled new minus-tracker source, rebuild (`npm run build` from the
    # repo root) yourself to pick up the changes.
    [ -x "$DIST_MCP_ENTRY" ] || chmod +x "$DIST_MCP_ENTRY"   # restore the bit `npm run build` normally sets, if it's ever missing
    echo "    not on PATH, but already built: $DIST_MCP_ENTRY"
  else
    echo "    not on PATH and not yet built — building the parent minus-tracker package (no npm link needed)..."
    (cd .. && npm ci && npm run build)
    if [ ! -f "$DIST_MCP_ENTRY" ]; then
      echo "ERROR: build succeeded but $DIST_MCP_ENTRY is still missing — check the build output above." >&2
      exit 1
    fi
    [ -x "$DIST_MCP_ENTRY" ] || chmod +x "$DIST_MCP_ENTRY"
    echo "    built: $DIST_MCP_ENTRY"
  fi
  export MINUS_TRACKER_MCP_COMMAND="$DIST_MCP_ENTRY"
fi

echo "==> Installing agent dependencies (uv sync)..."
uv sync

if [ "$MODE" = "ollama" ]; then
  echo "==> Setting up Ollama..."
  # SETUP_AND_RUN_WRAPPER tells setup_ollama.sh to skip its own standalone
  # "next steps" instructions — they'd contradict what this script does next
  # (it exports the model var itself and launches `adk web`, not `adk run`).
  SETUP_AND_RUN_WRAPPER=1 ./scripts/setup_ollama.sh "$OLLAMA_MODEL"   # exits non-zero if Ollama itself isn't installed
  MODEL="${OLLAMA_MODEL:-$DEFAULT_OLLAMA_MODEL}"
  export MINUS_TRACKER_AGENT_MODEL="ollama_chat/$MODEL"
  echo "==> Using local Ollama model: $MODEL — make sure Ollama is running" \
    "(\`ollama serve\`, or the app/service) before you continue."
else
  # Only clear a leftover Ollama-style value from an earlier --ollama run —
  # never discard a Claude model id the user explicitly set themselves.
  # Trimmed and lowercased for classification only (config.py's own
  # get_model() does the equivalent .strip()) — a kept value is re-echoed
  # trimmed too, so a whitespace-only leftover doesn't produce a misleading
  # "(model:    )" diagnostic when the agent will actually just fall back to
  # its default.
  _model_raw="${MINUS_TRACKER_AGENT_MODEL:-}"
  _model_raw="${_model_raw#"${_model_raw%%[![:space:]]*}"}"
  _model_raw="${_model_raw%"${_model_raw##*[![:space:]]}"}"
  case "$(printf '%s' "$_model_raw" | tr '[:upper:]' '[:lower:]')" in
    ollama_chat/* | ollama/*)
      unset MINUS_TRACKER_AGENT_MODEL
      echo "==> Using Anthropic Claude (claude-sonnet-5, the agent's own default)."
      ;;
    "")
      echo "==> Using Anthropic Claude (claude-sonnet-5, the agent's own default)."
      ;;
    *)
      echo "==> Using Anthropic Claude (model: $_model_raw)."
      ;;
  esac
fi

echo "==> Launching adk web..."
exec .venv/bin/adk web
