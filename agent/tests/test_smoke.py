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
`_ScriptedModel`, a ~10-line local test double built directly on ADK's own
public, stable model-plugin surface (`google.adk.models.BaseLlm`/
`LlmResponse` — the same base class real backends like `Gemini`/`LiteLlm`
subclass), so the turn that calls the tool is scripted rather than a real
(costly, non-deterministic, network-dependent) model call. Everything
downstream of that substitution — the `MCPToolset`, its stdio connection, the
real `minus-tracker-mcp` subprocess, the real `calculate_from_csv` composite
tool — is exactly what `build_agent()` constructs for real use.

Deliberately **not** `google.adk.cli.agent_test_runner.MockModel` (an earlier
version of this test used it): that class lives under ADK's own internal
`cli` package — it is ADK's tooling for its own `contributing/samples`
regression tests, not a documented public API — and it is genuinely absent
from a real span of the `google-adk` versions `agent/pyproject.toml` declares
support for (`>=1.0.0,<3.0.0`): missing through at least 1.8.x, only present
from 2.0.0 on. Gating this test's collection on that import via
`pytest.mark.skipif` made TC-250 silently un-runnable — 0 assertions
executed, pytest still exit-0 — in any environment that resolves an in-range
`google-adk` older than 2.0.0 (a real risk: nothing pins the floor that high,
and pip does not upgrade an already-installed compatible version). Scripting
the exact same "queue up N recorded turns, yield them one at a time"
behavior against ADK's stable public surface instead removes that whole
failure class: `BaseLlm`/`LlmResponse` are core to every ADK model backend,
so they are guaranteed present whenever `google-adk` itself imports.

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
from typing import Any, AsyncGenerator

import pytest
from google.adk.models import BaseLlm, LlmResponse
from google.adk.runners import InMemoryRunner
from google.genai import types
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from minus_tracker_agent.agent import build_agent

# This repo's build/verify tooling (`do-impl-plan.js`'s independent per-task
# verify step) has no way to observe a Python-only pytest result directly —
# it shells out via `test/mcp/adk-agent.test.ts`'s vitest bridge, which runs
# `pytest -m tc250` (not a bare `pytest`) specifically so it can select this
# TC's tests without depending on function names. Without this marker,
# `pytest -m tc250` deselects every test in this module and pytest exits 5
# ("no tests ran") — a failure that is invisible to a bare `pytest`/`pytest
# -q` run (which is why the prior attempt's own manual verification of this
# file reported everything passing) but is exactly what independent
# verification actually runs, so it failed there. Same failure class as the
# `MockModel`/`pytest.mark.skipif` issue this file's docstring above
# describes — a way for TC-250 to go silently unexecuted — just one layer
# up, in test *selection* rather than test *collection*.
pytestmark = pytest.mark.tc250


class _ScriptedModel(BaseLlm):
    """Local scripted-response test double, built on ADK's own public
    `BaseLlm` model-plugin interface (see module docstring for why this
    replaced `google.adk.cli.agent_test_runner.MockModel`).

    Mirrors that class's own (tiny, ~10-line) behavior exactly: queue up N
    recorded `LlmResponse`s at construction, then hand them out one per call
    to `generate_content_async`, in order.
    """

    model: str = "scripted-test-double"
    responses: list[LlmResponse] = []
    response_index: int = -1

    @classmethod
    def script(cls, turns: list[types.Content]) -> "_ScriptedModel":
        return cls(responses=[LlmResponse(content=turn) for turn in turns])

    async def generate_content_async(
        self, llm_request: Any, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        self.response_index += 1
        yield self.responses[self.response_index]


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
    mock_model = _ScriptedModel.script([call_turn, final_turn])

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
