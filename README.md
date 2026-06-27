# minus-tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **Status:** v0.5.7 — published on npm as `@gabrielerandelli/minus-tracker`.

---

## Italiano

minus-tracker è un progetto open-source sviluppato principalmente in TypeScript per il calcolo automatico di
**plusvalenze e minusvalenze** nel _Regime Dichiarativo_ — abbinamento lotti LIFO/FIFO,
normalizzazione multi-valuta con tassi BCE storici.

Carica dati seguendo il formato CSV adottato da DEGIRO.

### Cosa fa

- Calcolo plusvalenze/minusvalenze con abbinamento lotti **LIFO e FIFO** (configurabile)
- **Parser CSV DEGIRO**
- Gestione **multi-valuta** con tassi BCE storici (EUR, USD, GBP, CHF)
- Suite di test basata su **FAQ Agenzia Entrate**
- L'ouput può essere restituito in **italiano** (predefinito) o **inglese** (`--lang en`)
- minus-tracker è un package NPM con supporto CLI

### Avvio rapido

Non hai ancora un export DEGIRO? Usa il file di esempio incluso nel pacchetto.

**Via npx (senza installazione globale):**

```bash
curl -O https://raw.githubusercontent.com/gabrielerandelli/minus-tracker/main/samples/sample-trades.csv
npx @gabrielerandelli/minus-tracker calc sample-trades.csv
```

**Se hai già installato il pacchetto localmente:**

```bash
./node_modules/.bin/minus-tracker calc node_modules/@gabrielerandelli/minus-tracker/samples/sample-trades.csv
```

Il file contiene 5 operazioni fittizie (Apple Inc in USD + ASML Holding in EUR) e mostra
abbinamento LIFO parziale, conversione valuta e un risultato netto positivo.

### Installazione CLI

**Installazione globale** (comando disponibile da qualsiasi directory):

```bash
npm install -g @gabrielerandelli/minus-tracker
```

**Senza installazione globale** (nessuna configurazione necessaria):

```bash
npx @gabrielerandelli/minus-tracker calc trades.csv
```

### Utilizzo CLI

```bash
# Calcola plusvalenze/minusvalenze (output in italiano)
minus-tracker calc trades.csv

# Output in inglese
minus-tracker calc --lang en trades.csv

# Imposta la lingua in modo permanente
minus-tracker config --lang en   # oppure: --lang it

# Valida il CSV senza calcolare
minus-tracker validate trades.csv

# Controlla/aggiorna i tassi BCE
minus-tracker rates --check
minus-tracker rates --update
```

### Installazione libreria

```bash
npm install @gabrielerandelli/minus-tracker
```

### Utilizzo libreria

```ts
import { DEGIROParser, Calculator } from "@gabrielerandelli/minus-tracker";

const transactions = new DEGIROParser().parse(csv);
const report = new Calculator(transactions).calculateGains("LIFO"); // o "FIFO"
```

minus-tracker è **solo calcolo fiscale** — nessuna UI, autenticazione, database o PDF.

**Prerequisiti:** Node.js ≥ 24 ([nodejs.org](https://nodejs.org))

### Avvertenza

minus-tracker è un **ausilio al calcolo, non consulenza fiscale**. I risultati sono
destinati alla revisione e alla consegna a un commercialista qualificato.

---

## English

minus-tracker is an open-source project developed primarily in TypeScript for the automatic
calculation of **capital gains and losses** in the _Regime Dichiarativo_ — LIFO/FIFO lot
matching, multi-currency normalisation with historical ECB rates.

It loads data following the CSV format used by DEGIRO.

### What it does

- Capital-gains/loss calculation with configurable **LIFO and FIFO** lot matching
- **DEGIRO CSV parser**
- **Multi-currency** handling with historical ECB rates (EUR, USD, GBP, CHF)
- Test suite based on **Agenzia Entrate FAQ**
- Output in **Italian** (default) or **English** (`--lang en`)
- minus-tracker is an NPM package with CLI support

### Quick Start

Don't have a DEGIRO export yet? Use the sample file bundled with the package.

**Via npx (no global install needed):**

```bash
curl -O https://raw.githubusercontent.com/gabrielerandelli/minus-tracker/main/samples/sample-trades.csv
npx @gabrielerandelli/minus-tracker calc sample-trades.csv
```

**If you have already installed the package locally:**

```bash
./node_modules/.bin/minus-tracker calc node_modules/@gabrielerandelli/minus-tracker/samples/sample-trades.csv
```

The file contains 5 fictional trades (Apple Inc in USD + ASML Holding in EUR) and
demonstrates partial LIFO matching, currency conversion, and a positive net result.

### CLI Installation

**Global install** (command available system-wide):

```bash
npm install -g @gabrielerandelli/minus-tracker
```

**Without global install** (no setup required):

```bash
npx @gabrielerandelli/minus-tracker calc trades.csv
```

### CLI Usage

```bash
# Calculate gains/losses (Italian output, default)
minus-tracker calc trades.csv

# English output
minus-tracker calc --lang en trades.csv

# Set language permanently
minus-tracker config --lang en   # or: --lang it

# Validate CSV without calculating
minus-tracker validate trades.csv

# Check/update ECB rates
minus-tracker rates --check
minus-tracker rates --update
```

### Library Installation

```bash
npm install @gabrielerandelli/minus-tracker
```

### Library Usage

```ts
import { DEGIROParser, Calculator } from "@gabrielerandelli/minus-tracker";

const transactions = new DEGIROParser().parse(csv);
const report = new Calculator(transactions).calculateGains("LIFO"); // or "FIFO"
```

minus-tracker is **pure tax math** — no UI, auth, database, or PDF.

**Prerequisites:** Node.js ≥ 24 ([nodejs.org](https://nodejs.org))

### Disclaimer

minus-tracker is a **calculation aid, not tax advice**. Outputs are intended for review
and handoff to a qualified commercialista.

---

## Suite di Test di Stress

Esegui la suite di test integrata per verificare che l'installazione gestisca correttamente tutti
gli scenari supportati:

```bash
minus-tracker stress-test
```

Il comando genera 100 file CSV in una directory temporanea, esegue tutti i comandi CLI su ciascuno
e riporta i risultati senza toccare i tuoi file di progetto.

### Opzioni

| Flag                  | Predefinito                       | Descrizione                                    |
| --------------------- | --------------------------------- | ---------------------------------------------- |
| `--range N-M`         | `1-100`                           | Esegui solo gli scenari da N a M               |
| `--keep`              | disattivo                         | Mantieni i file CSV generati dopo l'esecuzione |
| `--json`              | disattivo                         | Output dei risultati in formato JSON           |
| `--output-dir <path>` | `/tmp/minus-tracker-stress-<ts>/` | Directory di output personalizzata             |

### Scenari

100 scenari che coprono: azioni EUR/USD/GBP/CHF, divergenza LIFO vs FIFO, consumo parziale
dei lotti, portafogli multi-ISIN, fallback BCE nei fine settimana, scenari di avvertenza ed
errore, operazioni same-day, casi limite di arrotondamento e portafogli grandi (fino a 200
transazioni).

---

## Stress Test Suite

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

---

## License

[MIT](./LICENSE) © 2026 Gabriele Randelli
