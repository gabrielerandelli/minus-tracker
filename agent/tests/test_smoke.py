"""TC-250 — ADK agent smoke test: end-to-end `calculate_from_csv` call
(impl_plan.md Task 69).

Starts a local `minus-tracker-mcp` (stdio), builds the real agent from
`minus_tracker_agent.agent.build_agent()` (exactly what a real install runs —
Task 68's own `LlmAgent` + `MCPToolset` wiring, unmodified here), and drives
one `calculate_from_csv` call through it with **`offline: true`** — a
deterministic, network-free call (this repo's CI has no internet access for
OpenFIGI, AGENTS.md; PRD Part 20's own "Testing Approach",
docs/prd/20-adk-agent.md).

The only substitution is the LLM backend itself: `agent.model` is swapped for
ADK's own `MockModel` test double (`google.adk.cli.agent_test_runner` — the
same scripted-response model ADK uses for its own `contributing/samples`
regression tests), so the turn that calls the tool is scripted rather than a
real (costly, non-deterministic, network-dependent) model call. Everything
downstream of that substitution — the `MCPToolset`, its stdio connection, the
real `minus-tracker-mcp` subprocess, the real `calculate_from_csv` composite
tool — is exactly what `build_agent()` constructs for real use.

Explicitly **not** using `agents-cli eval` / an LLM-graded evaluation harness
(PRD Part 20 Non-Goal) — this drives one deterministic tool call, it does not
grade conversational quality.

The assertion has two parts:

1. The agent-driven result is byte-identical (`generatedAt` timestamps
   aside) to a second, independent `calculate_from_csv` call made directly
   against a fresh server instance with the raw MCP SDK — mirroring
   `test_tool_discovery.py`'s own `_live_tool_names` ground-truth pattern.
   This is the parity check PRD Part 20's "Testing Approach" describes as
   the smoke test's `GainsReport` "match[ing] the same fixture already used
   to validate `calculate_gains` directly": both paths compose the exact
   same `parse -> classify -> calculate` chain Task 65 built, so an
   agent-introduced discrepancy (a dropped field, a mis-forwarded arg) shows
   up as an inequality here rather than passing unnoticed.
2. The shared, known-good fixture (`samples/sample-trades.csv`, PRD Part 10 —
   the same file `test/TC-042.test.ts` uses to validate `calculate_gains`
   directly, not a new, separately-maintained fixture) still produces the
   expected shape under LIFO: 3 matched lots (1 AAPL + 2 ASML), a net gain
   (docs/prd/10-sample-data.md's "Expected LIFO Output"), and — since
   `offline: true` skips OpenFIGI entirely (src/classifier/index.ts) — every
   ISIN left unresolved and defaulted to Bucket B (the best-effort semantics
   Task 65 inherits from `Calculator`).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from google.genai import types
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from minus_tracker_agent.agent import build_agent

try:
    from google.adk.cli.agent_test_runner import MockModel
    from google.adk.runners import InMemoryRunner
except ImportError:  # pragma: no cover - defensive against ADK internals moving
    MockModel = None
    InMemoryRunner = None

# .../minus-tracker/agent/tests/test_smoke.py -> .../minus-tracker
REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_CSV = REPO_ROOT / "samples" / "sample-trades.csv"

STOCK_ISINS = {"US0378331005", "NL0010273215"}

TOOL_NAME = "calculate_from_csv"
TOOL_ARGS: dict[str, Any] = {
    "csv": SAMPLE_CSV.read_text(),
    "method": "LIFO",
    "offline": True,
}


def _parse_tool_result(content: list[dict[str, Any]]) -> dict[str, Any]:
    """Parses `calculate_from_csv`'s MCP result shape
    (`{content: [{type: "text", text: "..."}]}`, `src/mcp/tools/calculate-from-csv.ts`)
    into `{report, warnings, unresolvedIsins}`."""
    return json.loads(content[0]["text"])


def _strip_generated_at(payload: dict[str, Any]) -> dict[str, Any]:
    """Both `report.generatedAt` (`src/calculator/index.ts`) and
    `report.dichiarazione.generatedAt` (`src/dichiarazione/index.ts`) are
    wall-clock `new Date().toISOString()` timestamps — the only fields two
    calls made moments apart are expected to disagree on. Every other field
    must match exactly."""
    report = payload["report"]
    report.pop("generatedAt", None)
    dichiarazione = report.get("dichiarazione")
    if isinstance(dichiarazione, dict):
        dichiarazione.pop("generatedAt", None)
    return payload


async def _direct_call(mcp_server_entry: Path) -> dict[str, Any]:
    """Ground truth: the same `calculate_from_csv` call made directly against
    a fresh server instance with the raw MCP SDK, bypassing the agent
    entirely — same pattern as `test_tool_discovery.py`'s `_live_tool_names`.
    """
    params = StdioServerParameters(command="node", args=[str(mcp_server_entry)])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(TOOL_NAME, arguments=TOOL_ARGS)
            assert not getattr(result, "isError", False), (
                f"direct calculate_from_csv call reported isError: {result}"
            )
            return _parse_tool_result([c.model_dump() for c in result.content])


async def _agent_driven_call() -> dict[str, Any]:
    """Drives `build_agent()`'s real `LlmAgent` + `MCPToolset` wiring through
    one scripted `calculate_from_csv` call via ADK's own `Runner`."""
    call_turn = types.Content(
        role="model",
        parts=[types.Part.from_function_call(name=TOOL_NAME, args=TOOL_ARGS)],
    )
    final_turn = types.Content(
        role="model",
        parts=[types.Part.from_text(text="Here are your capital gains.")],
    )
    mock_model = MockModel.create([call_turn, final_turn])

    agent = build_agent()
    agent.model = mock_model

    runner = InMemoryRunner(agent=agent)
    try:
        session = await runner.session_service.create_session(
            app_name=runner.app_name, user_id="tc250"
        )
        user_message = types.Content(
            role="user",
            parts=[types.Part.from_text(text="Calculate my gains, offline.")],
        )

        function_responses = []
        async for event in runner.run_async(
            user_id=session.user_id,
            session_id=session.id,
            new_message=user_message,
        ):
            function_responses.extend(event.get_function_responses())
    finally:
        # McpToolset holds an open stdio subprocess/session until closed.
        for tool in agent.tools:
            close = getattr(tool, "close", None)
            if close is not None:
                await close()

    assert len(function_responses) == 1, (
        "expected exactly one tool call (the scripted calculate_from_csv "
        f"turn), got {len(function_responses)}"
    )
    response = function_responses[0]
    assert response.name == TOOL_NAME
    assert not response.response.get("isError"), (
        f"agent-driven calculate_from_csv call reported isError: {response.response}"
    )
    return _parse_tool_result(response.response["content"])


pytestmark = pytest.mark.skipif(
    MockModel is None or InMemoryRunner is None,
    reason="google.adk.cli.agent_test_runner.MockModel unavailable in this ADK version",
)


class TestCalculateFromCsvSmoke:
    """TC-250."""

    async def test_agent_driven_call_matches_direct_call(
        self, mcp_stdio_env, mcp_server_entry
    ):
        direct = _strip_generated_at(await _direct_call(mcp_server_entry))
        agent_driven = _strip_generated_at(await _agent_driven_call())

        assert agent_driven == direct

    async def test_result_matches_the_sample_fixture(self, mcp_stdio_env):
        payload = await _agent_driven_call()
        report = payload["report"]

        assert report["method"] == "LIFO"
        # 1 AAPL lot (USD, ECB-converted) + 2 ASML lots under LIFO
        # (docs/prd/10-sample-data.md's "Expected LIFO Output").
        assert len(report["lots"]) == 3
        assert report["plusvalenze"] > 0
        assert report["minusvalenze"] > 0
        assert report["netResult"] > 0  # ASML's gain exceeds AAPL's loss

        # offline: true never queries OpenFIGI, so both sample ISINs are
        # unresolved and default to Bucket B (best-effort semantics, Task
        # 65's implementation notes) rather than failing the call outright.
        assert set(payload["unresolvedIsins"]) == STOCK_ISINS
        assert len(payload["warnings"]) == len(STOCK_ISINS)
