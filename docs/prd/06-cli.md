# Part 6 — CLI

## Installation

```
npm install -g minus-tracker
```

## Commands

### `calc` — calculate gains/losses

```
minus-tracker calc [options] <file.csv>

Options:
  --method <LIFO|FIFO>   Lot matching method (default: LIFO)
  --year <YYYY>          Tax year to display (default: inferred from transaction dates)
  --json                 Output machine-readable JSON instead of table
  --lang <it|en>         Locale for this run only (default: from config, falls back to it)
```

**Tax year inference (when `--year` is omitted):** the CLI derives the year from the most
frequently occurring calendar year across all transaction dates. If more than one year is present
in the CSV, a warning is appended (in the active locale).

**Default output (table) — Italian locale (default):**

```
minus-tracker calc trades.csv

METODO: LIFO | ANNO FISCALE: 2023

ISIN          TITOLO           QTÀ  DATA ACQUISTO  DATA VENDITA  ACQUISTO EUR  VENDITA EUR  GUADAGNO/PERDITA
US0378331005  Apple Inc         10  2023-03-01     2023-11-15      1.234,00      1.500,00          +266,00
IE00B4L5Y983  iShares MSCI W.   5  2023-01-10     2023-09-20        800,00        750,00           -50,00

────────────────────────────────────────────────────────────────────────
PLUSVALENZE:     266,00 EUR
MINUSVALENZE:     50,00 EUR
RISULTATO NETTO: 216,00 EUR

AVVERTENZE: 0
Generato: 2024-01-15T10:32:00Z

minus-tracker è un ausilio al calcolo, non consulenza fiscale.
```

_Full string catalog for both locales: see [Part 9](09-i18n.md)._

**JSON output (`--json`):**

```json
{
  "method": "LIFO",
  "plusvalenze": 266.00,
  "minusvalenze": 50.00,
  "netResult": 216.00,
  "lots": [...],
  "ratesUsed": { "USD:2023-03-01": 1.094 },
  "warnings": [],
  "generatedAt": "2024-01-15T10:32:00Z"
}
```

---

### `validate` — check CSV without calculating

```
minus-tracker validate [--lang <it|en>] <file.csv>
```

**Example output (Italian locale, default):**

```
OK: 143 transazioni analizzate, 0 errori gravi
AVVISO: 2 righe ignorate (nessun tasso BCE per CHF in data 2023-12-24)
```

Exit code 0 if no hard errors; 1 if any hard error.

---

### `rates` — manage bundled ECB snapshot

```
minus-tracker rates --check [--lang <it|en>]
minus-tracker rates --update [--lang <it|en>]
```

**Example output (Italian locale, default):**

```
minus-tracker rates --check
# Copertura: 2019-01-01 → 2024-01-12 | Valute: USD, GBP, CHF
# Lacune: nessuna

minus-tracker rates --update
# Recupero dati BCE SDMX in corso... Completato. Aggiunte 45 nuove date.
# Snapshot scritto in ~/.config/minus-tracker/ecb-rates.json
```

`--update` requires network access. It writes the merged snapshot to
`~/.config/minus-tracker/ecb-rates.json` (XDG user config directory), **not** to the package
installation. This file persists across `npm install`/`npm update`.

**Rate lookup priority at runtime:**

1. `~/.config/minus-tracker/ecb-rates.json` (user-updated snapshot, if present)
2. Bundled `src/data/ecb-rates.json` (shipped with the package)

The bundled snapshot is updated by repo maintainers before each release and committed to source.
End users who need rates beyond the bundled snapshot can run `rates --update` to extend coverage.

---

### `config` — manage persistent settings

```
minus-tracker config --lang <it|en>   Persist locale preference to settings file
minus-tracker config --show           Print current effective configuration
```

**Example — set language to English:**

```
$ minus-tracker config --lang en
Language set to: en
```

**Example — show current config (Italian locale active):**

```
$ minus-tracker config --show
Lingua corrente: it
```

Settings are written to `~/.config/minus-tracker/config.json` (see [Part 9](09-i18n.md) for
path resolution on all platforms and the full locale priority order).

## Exit codes

| Code | Meaning                                                                    |
| ---- | -------------------------------------------------------------------------- |
| 0    | Success                                                                    |
| 1    | Hard error (ParseError or CalculationError)                                |
| 2    | Invalid CLI usage (unknown flag, missing file, unsupported `--lang` value) |
