#!/usr/bin/env bash
# Optional: sets up everything needed for the local-Ollama model option
# (MINUS_TRACKER_AGENT_MODEL=ollama_chat/<model>). minus-tracker-agent works
# fully without this — see README.md's "Optional: Local Model via Ollama".
set -euo pipefail
cd "$(dirname "$0")/.."

PYTHON=python3
[ -x .venv/bin/python ] && PYTHON=.venv/bin/python

MODEL="${1:-gemma4:e2b}"

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
  exit 0
fi

echo "==> Pulling $MODEL via ollama (may take a while the first time)..."
ollama pull "$MODEL"

cat <<EOF

Done. Make sure Ollama is running (\`ollama serve\`, or the app/service), then:
  export MINUS_TRACKER_AGENT_MODEL=ollama_chat/$MODEL
  adk run minus_tracker_agent
EOF
