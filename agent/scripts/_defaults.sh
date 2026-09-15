#!/usr/bin/env bash
# Shared constants for the scripts in this directory — source this, don't run
# it directly. Single source of truth so setup_ollama.sh and setup_and_run.sh
# can't silently disagree on the default local model.
DEFAULT_OLLAMA_MODEL="gemma4:e2b"
