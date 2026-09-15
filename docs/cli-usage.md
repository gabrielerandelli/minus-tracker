[← Back to README](../README.md) · [All docs](README.md)

# CLI Usage

## Installation

**Global install** (command available system-wide):

```bash
npm install -g @gabrielerandelli/minus-tracker
```

**Without global install** (no setup required):

```bash
npx @gabrielerandelli/minus-tracker calc trades.csv
```

## Commands

| Command                | Key flags                                                                                                                                                  | Notes                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `calc <file.csv>`      | `--method LIFO\|FIFO` (default: LIFO), `--lang it\|en`, `--json`, `--export-dichiarazione [path]`, `--carry-forward`, `--offline`, `--broker degiro\|ibkr` | Never fetches ECB rates on its own — run `rates --update` periodically. If no `*.classify.json` sidecar is found, auto-classifies instruments (interactively if a terminal is attached, otherwise offline with a warning) and writes it to disk. Broker (DEGIRO/IBKR) is auto-detected from the CSV shape; use `--broker` to force it explicitly |
| `classify <file.csv>`  | `--offline`, `--broker degiro\|ibkr`                                                                                                                       | Explicit/optional invocation: classifies instruments (Bucket A/B) and creates/updates the `*.classify.json` sidecar. `calc` calls this automatically when needed; use this command to run it ahead of time or to get the interactive confirm flow. Requires an interactive terminal (TTY), or the `--offline` flag in scripted/CI contexts       |
| `validate <file.csv>`  | `--lang it\|en`, `--broker degiro\|ibkr`                                                                                                                   | Exit 0 with warnings; exit 1 on hard errors                                                                                                                                                                                                                                                                                                      |
| `rates --check`        | —                                                                                                                                                          | Shows bundled ECB snapshot coverage                                                                                                                                                                                                                                                                                                              |
| `rates --update`       | —                                                                                                                                                          | Fetches fresh rates from the ECB API                                                                                                                                                                                                                                                                                                             |
| `config --lang it\|en` | —                                                                                                                                                          | Saves language preference                                                                                                                                                                                                                                                                                                                        |
| `config --show`        | —                                                                                                                                                          | Shows current language setting                                                                                                                                                                                                                                                                                                                   |
| `stress-test`          | `--range N-M`, `--keep`, `--json`, `--output-dir`                                                                                                          | See [Stress Test](#stress-test) below                                                                                                                                                                                                                                                                                                            |
| `--help`               | —                                                                                                                                                          | Shows the banner and command list                                                                                                                                                                                                                                                                                                                |
| `--version`            | —                                                                                                                                                          | Shows the installed version                                                                                                                                                                                                                                                                                                                      |

Language precedence: `--lang` flag > saved config > Italian (default).

```bash
# Calculate gains/losses (English output, LIFO method)
minus-tracker calc --lang en trades.csv

# FIFO method, JSON output
minus-tracker calc --method FIFO --json trades.csv

# Validate CSV without calculating
minus-tracker validate trades.csv

# Check/update ECB rates
minus-tracker rates --check
minus-tracker rates --update

# Set language permanently
minus-tracker config --lang en   # or: --lang it
minus-tracker config --show
```

## Stress Test

Run the built-in stress test to verify your installation handles all supported scenarios:

```bash
minus-tracker stress-test
```

This generates 100 sample CSV files in a temporary directory, runs all CLI commands on each,
and reports pass/fail results without touching your project files.

### Options

| Flag                  | Default                           | Description                            |
| --------------------- | --------------------------------- | -------------------------------------- |
| `--range N-M`         | `1-100`                           | Run only scenarios N through M         |
| `--keep`              | off                               | Keep generated CSV files after the run |
| `--json`              | off                               | Output results as JSON                 |
| `--output-dir <path>` | `/tmp/minus-tracker-stress-<ts>/` | Override temp directory                |

### Scenarios

100 scenarios covering: EUR/USD/GBP/CHF stocks, LIFO vs FIFO divergence, partial lot
consumption, multi-ISIN portfolios, ECB weekend fallback, warning and error cases,
same-day trades, rounding edge cases, and large portfolios (up to 200 transactions).

## Next steps

- [Library Usage](library-usage.md) — call minus-tracker from TypeScript/JavaScript instead of the CLI
- [FAQ / Troubleshooting](faq.md) — common CLI errors

[← Back to README](../README.md) · [All docs](README.md)
