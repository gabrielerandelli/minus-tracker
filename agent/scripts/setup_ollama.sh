#!/usr/bin/env bash
# Sets up Option B (MINUS_TRACKER_AGENT_MODEL=ollama_chat/<model>) — see
# README.md's "Option B: Local via Ollama" section. Not needed if you're
# using Option A (Anthropic Claude) instead.
set -euo pipefail
source "$(dirname "$0")/_defaults.sh"
cd "$(dirname "$0")/.."

PYTHON=python3
[ -x .venv/bin/python ] && PYTHON=.venv/bin/python

if [ -n "${1:-}" ] && [ "${1#--}" != "$1" ]; then
  echo "ERROR: '$1' looks like a flag, not a model name — did you mean to omit it?" >&2
  exit 1
fi
MODEL="${1:-$DEFAULT_OLLAMA_MODEL}"

echo "==> Installing the 'ollama' extra (litellm) via $PYTHON..."
if "$PYTHON" -m pip --version >/dev/null 2>&1; then
  "$PYTHON" -m pip install -e ".[ollama]"
elif command -v uv >/dev/null 2>&1; then
  # `pip` isn't always present in a venv created by `uv venv` (vs. `uv sync`
  # or a plain `python -m venv`) — fall back to uv's own installer, still
  # targeting this exact interpreter.
  uv pip install -e ".[ollama]" --python "$PYTHON"
else
  echo "Neither pip nor uv is available for $PYTHON — install one and re-run." >&2
  exit 1
fi

if ! command -v ollama >/dev/null 2>&1; then
  cat <<EOF

Ollama itself isn't installed yet. Install it, then re-run this script:
  macOS:  brew install ollama
  Linux:  curl -fsSL https://ollama.com/install.sh | sh
  Other:  https://ollama.com/download
EOF
  exit 1
fi

echo "==> Pulling $MODEL via ollama (may take a while the first time)..."
ollama pull "$MODEL"

# Skip these standalone "next steps" when called from setup_and_run.sh — it
# does its own export and launches `adk web`, not `adk run`, so printing
# these here would contradict what happens next.
if [ -z "${SETUP_AND_RUN_WRAPPER:-}" ]; then
  cat <<EOF

Done. Make sure Ollama is running (\`ollama serve\`, or the app/service), then:
EOF
  [ -x .venv/bin/python ] && echo "  source .venv/bin/activate   # if you haven't this session"
  cat <<EOF
  export MINUS_TRACKER_AGENT_MODEL=ollama_chat/$MODEL
  adk run minus_tracker_agent
EOF
fi
