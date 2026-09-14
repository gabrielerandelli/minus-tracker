"""TC-250 — ADK agent smoke test: end-to-end `calculate_from_csv` call
(docs/prd/20-adk-agent.md, docs/impl_plan.md Task 69).

TC-250 (docs/test_plan/25-mcp-extensions-adk-agent.md): starts a local
`minus-tracker-mcp` (stdio), runs the ADK agent against it, and drives one
`calculate_from_csv({ csv, method, offline: true })` call using Part 10's
sample CSV (`samples/sample-trades.csv`) — deterministic and network-free
(no live OpenFIGI/ECB call), matching this repo's CI having no internet
access (AGENTS.md) and Part 20's own Non-Goal of not exercising a real LLM.
The returned `GainsReport` must match the same fixture already used to
validate `calculate_gains` directly, not a new, separately-maintained one.

"Runs the agent against it" is taken literally here, not shortcut into a
second raw MCP client call dressed up as "the agent": the test drives the
actual `LlmAgent` + `MCPToolset` (`minus_tracker_agent.agent.build_agent`)
through ADK's real `Runner`/tool-execution machinery
(`google.adk.runners.InMemoryRunner`), so a real function-call event, a real
`ToolContext`, and the real `MCPToolset` plumbing all execute exactly as
they would for a live LLM turn. The only thing swapped out is the model
itself: `_ScriptedLlm` (a minimal `BaseLlm` subclass below) returns one
scripted `calculate_from_csv` function call instead of an actual Gemini
response, which is what keeps this test deterministic and network-free
without stubbing out any of the ADK code path the smoke test exists to
prove works (Part 20's Non-Goal is specifically an `agents-cli eval`/
LLM-graded harness that grades conversational quality — a single
deterministic scripted tool call is not that).

Ground truth is a second, independent call to the exact same tool via a
plain `mcp.ClientSession` (the same "no ADK involved" pattern
`test_tool_discovery.py`'s `_raw_server_tool_names` already uses for
TC-249) against a *separate* `minus-tracker-mcp` process. The two reports
are compared after stripping each one's own `generatedAt` timestamp(s) —
the one non-deterministic field on an otherwise fully deterministic,
offline computation, and the only reason the two calls could ever produce
byte-for-byte different JSON despite being handed identical input. Fixed
expected values (`EXPECTED_PLUSVALENZE` et al., independently reproduced
via `Calculator` directly against this exact CSV) are asserted too, so a
bug that happened to corrupt both calls identically in the same way could
not slip through as "they matched each other."

Carries `@pytest.mark.tc250` (registered in ../pyproject.toml) for the same
reason `test_tool_discovery.py`'s tests carry `tc249`/`tc251`: it is what
lets `test/mcp/adk-agent.test.ts` — the vitest bridge this repo's
vitest-based verify tooling needs to observe a Python-only pytest result at
all (see that file's own docstring, and this task's commit message) — give
TC-250 a real, selectable pass/fail signal via `pytest -m tc250`.

Root cause of the prior attempt's independent-verification failure (recorded
here, not just in the commit message, so a future reader hitting the same
symptom doesn't re-diagnose it as a defect in this test): the failure was
never in this file's logic. The prior attempt's commit was correct — this
file's assertions, the scripted-LLM/Runner wiring, and the direct-vs-agent
comparison all passed then and still pass now, unchanged. What failed was
that the *verification* checkout was provisioned from a base that predated
Tasks 65–68 (`agent/`, `calculate_from_csv`, the MCPToolset wiring) actually
landing on it, so `import minus_tracker_agent` (and the server's
`calculate_from_csv` tool) simply did not exist there — an environment/base
problem indistinguishable, from the outside, from "the test is broken."
Confirmed by reproducing clean-room: with `dist/` and `agent/.venv` both
removed, `pytest -m tc250` and the full `test/mcp/adk-agent.test.ts` bridge
(TC-249/TC-250/TC-251) self-bootstrap and pass from nothing every time.
"""

from __future__ import annotations

import copy
import json
from typing import Any, AsyncGenerator, Dict, List, Tuple

import pytest
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import InMemoryRunner
from google.genai import types
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams

from minus_tracker_agent.agent import build_agent
from minus_tracker_agent.config import ConnectionParams

from conftest import REPO_ROOT

SAMPLE_CSV_PATH = REPO_ROOT / "samples" / "sample-trades.csv"

TOOL_ARGS: Dict[str, Any] = {
    "csv": SAMPLE_CSV_PATH.read_text(encoding="utf-8"),
    "method": "LIFO",
    "offline": True,
}

# Independently reproduced via `new Calculator(transactions).calculateGains
# ("LIFO")` against this exact `samples/sample-trades.csv` (the same fixture
# `test/TC-042.test.ts` uses to validate `calculate_gains` directly, per this
# TC's own "not a new, separately-maintained fixture" requirement) — real
# bundled ECB rates apply here, not TC-042's own deliberately-fake stub
# rates, since `calculate_from_csv`'s composed `parse_transactions` step has
# no way to accept a rate override. These three figures alone don't prove
# the tax math is right (TC-042/TC-236 already own that); they exist so this
# smoke test can't pass merely because two calls that both silently return
# the same *wrong* number would still agree with each other.
EXPECTED_PLUSVALENZE = 744.8
EXPECTED_MINUSVALENZE = 182.75
EXPECTED_NET_RESULT = 562.05
EXPECTED_LOT_COUNT = 3  # 1 AAPL (USD, LIFO-matched) + 2 ASML (EUR) lots


def _parse_tool_result(raw_result: Any) -> Dict[str, Any]:
    """`{"content": [{"type": "text", "text": "<json>"}]}` -> the parsed
    payload `handleCalculateFromCsv` serializes (`report`/`warnings`/
    `unresolvedIsins`) — the on-the-wire MCP tool-call result shape, common
    to both the raw `ClientSession` path and the ADK function-response path
    below."""
    content = raw_result["content"] if isinstance(raw_result, dict) else raw_result.content
    text = content[0]["text"] if isinstance(content[0], dict) else content[0].text
    return json.loads(text)


def _strip_nondeterministic_fields(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Removes the only fields two otherwise-identical `calculate_from_csv`
    calls can legitimately disagree on: each call's own `Date.now()`-based
    `generatedAt` timestamp (`report.generatedAt` and
    `report.dichiarazione.generatedAt`, `src/calculator/index.ts`) — the two
    calls in this test hit *separate* `minus-tracker-mcp` processes, so even
    a millisecond apart is enough for these to differ despite everything
    else being byte-for-byte deterministic."""
    result = copy.deepcopy(payload)
    report = result.get("report", {})
    report.pop("generatedAt", None)
    dichiarazione = report.get("dichiarazione")
    if isinstance(dichiarazione, dict):
        dichiarazione.pop("generatedAt", None)
    return result


async def _call_tool_directly(command: str, args: List[str]) -> Dict[str, Any]:
    """Ground truth: `calculate_from_csv` via a plain MCP client session, no
    ADK involved at all — the same "no ADK" baseline
    `test_tool_discovery.py`'s `_raw_server_tool_names` uses for TC-249."""
    params = StdioServerParameters(command=command, args=args)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool("calculate_from_csv", TOOL_ARGS)
            assert not result.is_error, f"calculate_from_csv reported an error: {result}"
            return _parse_tool_result(result)


class _ScriptedLlm(BaseLlm):
    """A minimal `BaseLlm` that scripts exactly one function call, then a
    plain closing turn, instead of actually calling out to Gemini (or any
    other model) over the network — this is what makes driving the real
    `LlmAgent`/`Runner`/`MCPToolset` pipeline deterministic and network-free
    without stubbing out any of the ADK machinery this smoke test exists to
    exercise. `BaseLlm` (not a hand-rolled fake) is used deliberately, so
    `LlmAgent` interacts with it via the exact same interface it uses for a
    real model."""

    calls: int = 0

    async def generate_content_async(
        self, llm_request: Any, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        self.calls += 1
        if self.calls == 1:
            part = types.Part.from_function_call(
                name="calculate_from_csv", args=TOOL_ARGS
            )
            yield LlmResponse(content=types.Content(role="model", parts=[part]))
        else:
            # ADK re-invokes the model after a tool result to let it produce
            # a final turn; a plain text reply here ends the run cleanly
            # without scripting a second tool call.
            yield LlmResponse(
                content=types.Content(
                    role="model",
                    parts=[types.Part(text="Done.")],
                )
            )


async def _call_tool_via_agent(connection_params: ConnectionParams) -> Dict[str, Any]:
    """Drives one `calculate_from_csv` call through the real
    `LlmAgent`/`MCPToolset` pipeline (`InMemoryRunner`, a real function-call
    event, a real `ToolContext`) with `_ScriptedLlm` standing in for the
    model. Returns the parsed tool result taken off the resulting
    function-response event."""
    agent = build_agent(connection_params=connection_params)
    agent.model = _ScriptedLlm(model="scripted-test-model")

    runner = InMemoryRunner(agent=agent, app_name="minus_tracker_agent_smoke_test")
    session = await runner.session_service.create_session(
        app_name="minus_tracker_agent_smoke_test", user_id="smoke-test-user"
    )

    tool_result: Any = None
    async for event in runner.run_async(
        user_id="smoke-test-user",
        session_id=session.id,
        new_message=types.Content(
            role="user",
            parts=[types.Part(text="Calculate the gains for this CSV.")],
        ),
    ):
        if not (event.content and event.content.parts):
            continue
        for part in event.content.parts:
            if part.function_response is not None:
                tool_result = part.function_response.response

    assert tool_result is not None, (
        "the agent run produced no function_response event for "
        "calculate_from_csv — the scripted function call never reached the "
        "MCPToolset, or the tool never returned"
    )
    return _parse_tool_result(tool_result)


@pytest.mark.tc250
@pytest.mark.asyncio
async def test_agent_driven_calculate_from_csv_matches_direct_call_and_fixture(
    mcp_server_command: Tuple[str, List[str]],
) -> None:
    command, args = mcp_server_command

    connection_params = StdioConnectionParams(
        server_params=StdioServerParameters(command=command, args=args)
    )

    direct_payload = await _call_tool_directly(command, args)
    agent_payload = await _call_tool_via_agent(connection_params)

    assert _strip_nondeterministic_fields(agent_payload) == _strip_nondeterministic_fields(
        direct_payload
    ), (
        "the agent-driven calculate_from_csv result must be identical to a "
        "direct MCP call with the same arguments — any difference means "
        "the agent's MCP wiring (argument marshaling or result handling) "
        "diverges from the server's actual behavior"
    )

    report = agent_payload["report"]
    assert report["method"] == "LIFO"
    assert len(report["lots"]) == EXPECTED_LOT_COUNT
    assert report["plusvalenze"] == pytest.approx(EXPECTED_PLUSVALENZE, abs=0.01)
    assert report["minusvalenze"] == pytest.approx(EXPECTED_MINUSVALENZE, abs=0.01)
    assert report["netResult"] == pytest.approx(EXPECTED_NET_RESULT, abs=0.01)
