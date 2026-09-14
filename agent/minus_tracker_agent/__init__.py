"""minus-tracker ADK agent package.

`from . import agent` matches the `agents-cli scaffold create` convention
(a `root_agent` module attribute ADK's `adk run`/`adk web` discover) — see
docs/prd/20-adk-agent.md.
"""

from . import agent

__all__ = ["agent"]
