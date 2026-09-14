"""Error types for the minus-tracker ADK agent.

Mirrors this repo's TypeScript error-code convention (``src/errors.ts``):
a dedicated exception class carrying a stable, machine-checkable ``code``
attribute a caller can match on, rather than a bare ``RuntimeError`` whose
only signal is a free-form message string.
"""

from __future__ import annotations

from typing import Literal

# Kept as a module-level tuple (not just inline in the Literal below) so
# both the type checker and runtime validation (see AgentConfigError.code)
# read from the same single source of truth — same reasoning as
# ParseError/ClassificationError's `.code` unions in src/errors.ts.
AgentConfigErrorCode = Literal["MISSING_MCP_URL", "UNKNOWN_MCP_TRANSPORT"]


class AgentConfigError(RuntimeError):
    """Raised when the agent's MCP connection is misconfigured.

    Attributes:
        code: one of ``AgentConfigErrorCode`` — stable across message
            wording changes, so callers can branch on it directly.
    """

    code: AgentConfigErrorCode

    def __init__(self, code: AgentConfigErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return f"AgentConfigError(code={self.code!r}, message={str(self)!r})"
