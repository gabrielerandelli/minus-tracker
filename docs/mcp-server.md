[← Back to README](../README.md) · [All docs](README.md)

# MCP Server

As of v0.8.0, minus-tracker ships a `minus-tracker-mcp` binary exposing an
[MCP server](https://modelcontextprotocol.io) over stdio, for direct use by AI agents (no need to
go through the CLI):

```bash
npx -p @gabrielerandelli/minus-tracker minus-tracker-mcp
```

Typical MCP client configuration (e.g. Claude Desktop, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "minus-tracker": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "@gabrielerandelli/minus-tracker",
        "minus-tracker-mcp"
      ]
    }
  }
}
```

The server exposes 5 tools:

| Tool                   | Description                                                           |
| ---------------------- | --------------------------------------------------------------------- |
| `parse_transactions`   | Parses a DEGIRO CSV into `transactions`/`warnings`/`incomeRows`       |
| `classify_instruments` | Classifies ISINs into Bucket A/B (stateless mode — no sidecar file)   |
| `calculate_gains`      | Calculates gains/losses (LIFO/FIFO) and, when available, Quadro RT/RM |
| `calculate_from_csv`   | Composite tool: parses, classifies, and calculates in a single call   |
| `check_rate_coverage`  | Per-currency ECB rate coverage/gaps (read-only, no network call)      |

`classify_instruments` supports `existingClassification`, `overrides`, and `offline: true` to run
without network access or filesystem access — designed to be called repeatedly by an agent across
multiple calls, with state kept client-side.

`calculate_from_csv` (v0.13.0) targets LLM-orchestrated callers: instead of the model having to
reproduce the full `Transaction[]` array verbatim as the argument to the next tool call (with a
real risk of truncation or a dropped row), it only ever has to relay the original CSV text again.
It accepts `overrides`/`offline` (forwarded into the classify step) and `carryForward` (forwarded
into the calculate step — this tool is fully stateless, so `carryForward` must be resent on every
call or its effect is silently lost); the parse step's `incomeRows` is wired into the calculate
step automatically. An unresolved ISIN still defaults to Bucket B (same as `calculate_gains`) and
is listed in `unresolvedIsins`, so a follow-up call can pass `overrides` to correct it.

**Transports:** `minus-tracker-mcp` defaults to stdio (unchanged). Pass `--transport sse --port
<n>` to instead expose a [Streamable HTTP/SSE](https://modelcontextprotocol.io) listener — useful
for agent frameworks that talk HTTP rather than spawning a subprocess. The listener binds to
`127.0.0.1` by default (never `0.0.0.0`), since this mode ships with no authentication and these
tools operate on real financial transaction data; pass `--host <address>` to bind elsewhere as an
explicit opt-in. The server remains stateless regardless of transport.

```bash
npx -p @gabrielerandelli/minus-tracker minus-tracker-mcp --transport sse --port 3000
```

**Example agent:** `agent/` is a standalone Python subproject (never imported into the npm build)
demonstrating an ADK `LlmAgent` wired to `minus-tracker-mcp` via `MCPToolset` — see
[`agent/README.md`](../agent/README.md) for setup and configuration.

## Next steps

- [FAQ / Troubleshooting](faq.md)

[← Back to README](../README.md) · [All docs](README.md)
