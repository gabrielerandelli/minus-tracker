#!/usr/bin/env bash
# One-command setup + launch: builds/links minus-tracker-mcp (if not already on
# PATH and not connecting to an already-running server over sse), installs the
# agent's dependencies, configures the model, and launches `adk web`. See
# README.md's "Quick start" section.
#
# Usage:
#   ./scripts/setup_and_run.sh                    # Anthropic Claude — needs
#                                                  # ANTHROPIC_API_KEY (or
#                                                  # ANTHROPIC_AUTH_TOKEN) set
#   ./scripts/setup_and_run.sh --ollama [model]    # fully local — model
#                                                  # defaults to
#                                                  # DEFAULT_OLLAMA_MODEL in
#                                                  # scripts/_defaults.sh
#
# Respects MINUS_TRACKER_MCP_TRANSPORT/MINUS_TRACKER_MCP_URL if already
# exported (see README.md's "MCP connection" section) — with sse, the npm
# build/link step below is skipped since there's nothing to spawn locally.
set -euo pipefail
source "$(dirname "$0")/_defaults.sh"
cd "$(dirname "$0")/.."   # agent/

MODE="anthropic"
if [ -n "${1:-}" ]; then
  if [ "$1" = "--ollama" ]; then
    MODE="ollama"
    shift
  else
    echo "ERROR: unrecognized argument '$1' — expected '--ollama [model]' or no arguments." >&2
    exit 1
  fi
fi

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
if [ "$TRANSPORT" = "sse" ] && [ -z "${MINUS_TRACKER_MCP_URL:-}" ]; then
  echo "ERROR: MINUS_TRACKER_MCP_TRANSPORT=sse requires MINUS_TRACKER_MCP_URL too" >&2
  echo "(e.g. http://127.0.0.1:8080/mcp) — no default is guessed, since --port has none." >&2
  exit 1
fi

echo "==> Checking minus-tracker-mcp..."
if [ "$TRANSPORT" = "sse" ]; then
  echo "    MINUS_TRACKER_MCP_TRANSPORT=sse — connecting to an already-running server, skipping build/link."
elif command -v minus-tracker-mcp >/dev/null 2>&1; then
  # PATH check only, not a freshness check — if you've since pulled new
  # minus-tracker source, re-run `npm run build && npm link` from the repo
  # root yourself to pick up the changes.
  echo "    found: $(command -v minus-tracker-mcp)"
else
  echo "    not found — building and linking the parent minus-tracker package..."
  (cd .. && npm ci && npm run build && npm link)
  if ! command -v minus-tracker-mcp >/dev/null 2>&1; then
    echo "ERROR: npm link succeeded but minus-tracker-mcp still isn't on PATH." >&2
    echo "Check that npm's global bin directory is itself on PATH (\`npm config get prefix\`), then retry." >&2
    exit 1
  fi
fi

echo "==> Installing agent dependencies (uv sync)..."
uv sync

if [ "$MODE" = "ollama" ]; then
  echo "==> Setting up Ollama..."
  # SETUP_AND_RUN_WRAPPER tells setup_ollama.sh to skip its own standalone
  # "next steps" instructions — they'd contradict what this script does next
  # (it exports the model var itself and launches `adk web`, not `adk run`).
  SETUP_AND_RUN_WRAPPER=1 ./scripts/setup_ollama.sh "$@"   # exits non-zero if Ollama itself isn't installed
  MODEL="${1:-$DEFAULT_OLLAMA_MODEL}"
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
