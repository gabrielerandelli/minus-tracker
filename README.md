<p align="center">
  <img
    src="./.github/assets/banner.png"
    alt="minus-tracker — Italian Capital Gains & Losses Tracker / Calcolo Plusvalenze e Minusvalenze"
    width="100%"
  />
</p>

# minus-tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/@gabrielerandelli/minus-tracker.svg)](https://www.npmjs.com/package/@gabrielerandelli/minus-tracker)
[![npm downloads](https://img.shields.io/npm/dm/@gabrielerandelli/minus-tracker.svg)](https://www.npmjs.com/package/@gabrielerandelli/minus-tracker)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-server-blueviolet.svg)](https://modelcontextprotocol.io)

⚠️ **Ausilio al calcolo, non consulenza fiscale** — vedi l'[Avvertenza](#avvertenza).
⚠️ **Calculation aid only, not tax advice** — see the [Disclaimer](#disclaimer).

🤖 **Novità: server MCP** — qualsiasi agente AI può calcolare plusvalenze/minusvalenze italiane direttamente, senza passare dalla CLI.
🤖 **New: MCP server** — any AI agent can compute Italian capital gains/losses directly, no CLI required.

✅ Validato su tutti i 12 scenari FAQ dell'Agenzia delle Entrate · 120 test automatici · zero dipendenze runtime nella libreria core.
✅ Validated against all 12 Agenzia delle Entrate FAQ scenarios · 120 automated tests · zero runtime dependencies in the core library.

_L'unico tool open-source che trasforma un export DEGIRO grezzo direttamente in plusvalenze/minusvalenze corrette secondo l'Agenzia delle Entrate — come CLI, libreria, o strumento MCP richiamabile dal tuo agente AI._
_The only open-source tool that turns a raw DEGIRO export directly into Agenzia-Entrate-correct capital gains/losses — as a CLI, a library, or an MCP tool your AI agent can call._

---

## Italiano

minus-tracker è un progetto open-source sviluppato principalmente in TypeScript per il calcolo automatico di **plusvalenze e minusvalenze** in _Regime Dichiarativo_. Gestisce la sincronizzazione dei lotti tramite logica LIFO/FIFO e la normalizzazione multivaluta utilizzando i tassi storici della BCE.

Il tool elabora i dati partendo direttamente dal formato CSV esportato da DEGIRO.

### Funzionalità

- Calcolo di plusvalenze e minusvalenze con gestione dei lotti via **LIFO o FIFO** (configurabile)
- **Parser integrato** per i file CSV di DEGIRO
- Gestione **multivaluta** con tassi storici BCE (EUR, USD, GBP, CHF)
- **Classificazione fiscale degli strumenti finanziari in due categorie** (Bucket A/B) — azioni,
  ETF, titoli di stato, derivati — con classificazione automatica tramite OpenFIGI e sidecar JSON
  persistente
- **Modello Redditi PF**: genera Quadro RT (redditi diversi) e Quadro RM (redditi di capitale) a
  partire dai lotti calcolati, con riporto delle minusvalenze pregresse (regola dei 4 anni)
- Suite di test allineata alle **FAQ dell'Agenzia delle Entrate**
- Output disponibile in **italiano** (default) o **inglese** (`--lang en`)
- Disponibile come pacchetto NPM con supporto CLI

**Novità in v0.8.0:**

- **Modalità stateless per `Classifier`**: `classify()` può ora funzionare senza alcun accesso al
  filesystem (nessun sidecar), utile per l'integrazione con agenti e automazioni
- **Server MCP** (`minus-tracker-mcp`): espone `parse_transactions`, `classify_instruments` e
  `calculate_gains` come tool MCP su stdio, per l'uso diretto da parte di agenti AI — vedi la
  sezione [Server MCP](#server-mcp) più sotto

### Avvio rapido

Se non hai ancora un export di DEGIRO a disposizione, puoi testare il tool con il file di esempio incluso nel pacchetto.

**Via npx (senza installazione globale):**

```bash
curl -O https://raw.githubusercontent.com/gabrielerandelli/minus-tracker/main/samples/sample-trades.csv
npx @gabrielerandelli/minus-tracker calc sample-trades.csv
```

**Se hai già installato il pacchetto localmente:**

```bash
./node_modules/.bin/minus-tracker calc node_modules/@gabrielerandelli/minus-tracker/samples/sample-trades.csv
```

Il file di esempio contiene 5 operazioni fittizie (Apple Inc in USD + ASML Holding in EUR) e mostra un esempio di scarico parziale LIFO, la conversione valutaria e un risultato netto positivo.

### Output di esempio

L'esecuzione di `calc` sul file di esempio produce:

```
METODO: LIFO | ANNO FISCALE: 2024

ISIN            TITOLO                  QTÀ  DATA ACQUISTO  DATA VENDITA    ACQUISTO EUR    VENDITA EUR   GUADAGNO/PERDITA
US0378331005    Apple Inc                10  2024-01-02    2024-01-05           1371,11        1188,37            -182,75
NL0010273215    ASML Holding N.V.         3  2024-04-01    2024-07-15           2552,00        2849,00            +297,00
NL0010273215    ASML Holding N.V.         3  2024-01-15    2024-07-15           2401,20        2849,00            +447,80

────────────────────────────────────────────────────────────────────────
PLUSVALENZE:    744,80 EUR
MINUSVALENZE:  182,75 EUR
RISULTATO NETTO: 562,05 EUR
```

Con il flag `--json` si ottiene direttamente l'oggetto `GainsReport` in formato JSON — utile per integrazioni programmatiche (vedi [Esempio di utilizzo nel codice](#esempio-di-utilizzo-nel-codice)).

### Formato CSV DEGIRO

Esporta da **Attività → Transazioni** (NON il rendiconto del conto) nella tua area personale DEGIRO. Usa l'esportazione predefinita con tutte le colonne.

Valute supportate: **EUR** (nessuna conversione), **USD**, **GBP**, **CHF** (tassi storici BCE inclusi, 2019–oggi).

Le date nel file DEGIRO sono in formato `GG-MM-AAAA`; il parser le converte automaticamente in ISO.

Le righe con ISIN mancante, valuta non supportata o nessun tasso BCE disponibile entro 3 giorni lavorativi vengono saltate con un avviso (non un errore) — usa `validate` per ispezionarle prima del calcolo.

### Installazione CLI

**Installazione globale** (per rendere il comando disponibile in ogni directory):

```bash
npm install -g @gabrielerandelli/minus-tracker
```

**Senza installazione globale** (esecuzione al volo):

```bash
npx @gabrielerandelli/minus-tracker calc trades.csv
```

### Utilizzo CLI

| Comando                | Flag principali                                                                                                                   | Note                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calc <file.csv>`      | `--method LIFO\|FIFO` (default: LIFO), `--lang it\|en`, `--json`, `--export-dichiarazione [path]`, `--carry-forward`, `--offline` | Non aggiorna mai i tassi BCE da solo — esegui `rates --update` periodicamente. Se non trova un sidecar `*.classify.json`, classifica automaticamente gli strumenti (interattivo se è collegato un terminale, altrimenti offline con avviso) e lo scrive su disco                                                                                     |
| `classify <file.csv>`  | `--offline`                                                                                                                       | Invocazione esplicita/opzionale: classifica gli strumenti (Bucket A/B) e crea/aggiorna il sidecar `*.classify.json`. `calc` la richiama automaticamente quando serve; usa questo comando per farlo in anticipo o per il flusso di conferma interattivo. Richiede un terminale interattivo (TTY), oppure il flag `--offline` in contesti scriptati/CI |
| `validate <file.csv>`  | `--lang it\|en`                                                                                                                   | Exit 0 con avvisi; exit 1 in caso di errori bloccanti                                                                                                                                                                                                                                                                                                |
| `rates --check`        | —                                                                                                                                 | Mostra la copertura della snapshot BCE in locale                                                                                                                                                                                                                                                                                                     |
| `rates --update`       | —                                                                                                                                 | Scarica i tassi aggiornati dall'API BCE                                                                                                                                                                                                                                                                                                              |
| `config --lang it\|en` | —                                                                                                                                 | Salva la lingua preferita                                                                                                                                                                                                                                                                                                                            |
| `config --show`        | —                                                                                                                                 | Mostra la lingua correntemente impostata                                                                                                                                                                                                                                                                                                             |
| `stress-test`          | `--range N-M`, `--keep`, `--json`, `--output-dir`                                                                                 | Documentato in fondo                                                                                                                                                                                                                                                                                                                                 |

Precedenza lingua: `--lang` > lingua salvata > italiano (default).

```bash
# Calcola plusvalenze/minusvalenze (output in italiano, metodo LIFO)
minus-tracker calc trades.csv

# Metodo FIFO, output in inglese, formato JSON
minus-tracker calc --method FIFO --lang en --json trades.csv

# Valida il CSV senza calcolare
minus-tracker validate trades.csv

# Controlla o aggiorna i tassi BCE in locale
minus-tracker rates --check
minus-tracker rates --update

# Imposta la lingua di default in modo permanente
minus-tracker config --lang en   # oppure: --lang it
minus-tracker config --show
```

### Installazione come libreria

```bash
npm install @gabrielerandelli/minus-tracker
```

### Esempio di utilizzo nel codice

```ts
import {
  DEGIROParser,
  Calculator,
  Classifier,
  ParseError,
  CalculationError,
} from "@gabrielerandelli/minus-tracker";
import type { GainsReport, LotMethod } from "@gabrielerandelli/minus-tracker";

// 1. Parsing
const parser = new DEGIROParser();
const transactions = parser.parse(csvString); // lancia ParseError in caso di CSV non valido
if (parser.warnings.length > 0) {
  console.warn("Righe saltate:", parser.warnings);
}

// 2. Classificazione (Bucket A/B) — facoltativa, abilita Quadro RT/RM nel report
const classification = await new Classifier().classify(
  transactions,
  "trades.classify.json", // sidecar persistente; assente in modalità stateless
);

// 3. Calcolo
const method: LotMethod = "LIFO"; // oppure "FIFO"
const report: GainsReport = new Calculator(transactions, parser.warnings, {
  classification,
}).calculateGains(method);

console.log(report.plusvalenze); // numero in EUR
console.log(report.minusvalenze); // numero in EUR (valore assoluto)
console.log(report.netResult); // plusvalenze - minusvalenze
console.log(report.lots); // MatchedLot[] — dettaglio per lotto
console.log(report.dichiarazione); // Quadro RT/RM, se classification è stata passata

// 4. Gestione errori
try {
  const txs = parser.parse(csvString);
  const r = new Calculator(txs, parser.warnings).calculateGains("LIFO");
} catch (err) {
  if (err instanceof ParseError) {
    if (err.code === "MISSING_COLUMN") {
      console.error("Colonna mancante:", err.columnName);
    } else {
      console.error("CSV non valido");
    }
  } else if (err instanceof CalculationError) {
    console.error(
      `VENDITA senza acquisto corrispondente: ${err.isin} del ${err.date}`,
    );
  }
}
```

> **Nota:** `parser.warningEntries` (visibile nell'autocomplete TypeScript) è un'API interna usata dal renderer CLI. Per uso programmatico usa `parser.warnings` (`string[]`).

> 💡 minus-tracker si occupa **esclusivamente del calcolo fiscale** — non include interfacce grafiche (UI), sistemi di autenticazione, database o esportazioni in PDF.

**Prerequisiti:** Node.js ≥ 24 ([nodejs.org](https://nodejs.org))

### Server MCP

A partire dalla v0.8.0, minus-tracker include un binario `minus-tracker-mcp` che espone un
[server MCP](https://modelcontextprotocol.io) su stdio, pensato per l'uso diretto da parte di
agenti AI (senza passare dalla CLI):

```bash
npx -p @gabrielerandelli/minus-tracker minus-tracker-mcp
```

Configurazione tipica per un client MCP (es. Claude Desktop, `claude_desktop_config.json`):

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

Il server espone 3 tool:

| Tool                   | Descrizione                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `parse_transactions`   | Esegue il parsing di un CSV DEGIRO, restituendo `transactions`/`warnings`/`incomeRows` |
| `classify_instruments` | Classifica gli ISIN in Bucket A/B (modalità stateless — nessun sidecar)                |
| `calculate_gains`      | Calcola plusvalenze/minusvalenze (LIFO/FIFO) e, se disponibile, Quadro RT/RM           |

`classify_instruments` supporta `existingClassification`, `overrides` e `offline: true` per
funzionare senza rete e senza accesso al filesystem — pensato per essere invocato ripetutamente
da un agente in chiamate successive, mantenendo lo stato lato client.

### Domande frequenti

**Il CSV viene rifiutato con "colonna mancante" o "CSV non valido"**
Verifica di aver esportato da Attività → **Transazioni** e non dal rendiconto del conto. Il parser richiede il formato dell'export Transazioni.

**Alcune righe vengono saltate con un avviso**
Le righe vengono saltate (senza bloccare il calcolo) quando: l'ISIN è vuoto, la valuta non è tra EUR/USD/GBP/CHF, oppure non esiste un tasso BCE entro 3 giorni lavorativi dalla data dell'operazione. Usa `validate` per i dettagli.

**Errore "nessun lotto aperto per ISIN X alla data Y"**
Il CSV contiene una vendita per un titolo senza un acquisto precedente nel file. L'acquisto potrebbe essere in un export di un anno precedente non incluso. Usa `validate` per esaminare le transazioni parsate.

**I tassi BCE sono scaduti**
Esegui `minus-tracker rates --update`. Il comando `calc` non aggiorna mai i tassi da solo: l'aggiornamento è sempre un'azione esplicita.

**LIFO o FIFO?**
Il Regime Dichiarativo utilizza il LIFO come metodo predefinito ai sensi della normativa fiscale italiana. Il FIFO è disponibile per confronto. Consulta il tuo commercialista per conferma.

### Limitazioni note

minus-tracker aggrega le plusvalenze e le minusvalenze di **tutti gli strumenti finanziari in un'unica somma**, indipendentemente dalla loro categoria fiscale.

La normativa italiana prevede che i **redditi diversi** (azioni, derivati, certificati — Art. 67 TUIR) e i **redditi di capitale** (ETF/fondi UCITS — Art. 44 TUIR) non possano essere compensati tra loro: una minusvalenza su un ETF non può ridurre la plusvalenza su un'azione, e viceversa.

**Portafogli con soli titoli azionari o soli ETF:** il calcolo è corretto.
**Portafogli misti (azioni + ETF):** il risultato netto riportato non è direttamente utilizzabile ai fini dichiarativi. In questo caso è necessario separare manualmente i lotti per categoria fiscale prima di presentare la dichiarazione, con l'assistenza di un commercialista.

### Avvertenza

minus-tracker è un **progetto personale** sviluppato a titolo privato e **non è in alcun modo affiliato, sponsorizzato o rappresentativo del datore di lavoro dell'autore o di qualsiasi altra organizzazione**.

Il tool è fornito **esclusivamente come ausilio al calcolo** e **non costituisce consulenza fiscale, legale o finanziaria**. L'autore **declina ogni responsabilità** per eventuali errori nei calcoli, per un utilizzo improprio dello strumento o per le decisioni prese dall'utente finale sulla base dei report generati.

Si raccomanda **sempre** di verificare i risultati con un commercialista o professionista fiscale qualificato prima di presentare qualsiasi dichiarazione.

---

## Stress Test

Puoi eseguire la suite di stress test integrata per verificare che l'installazione gestisca correttamente tutti gli scenari previsti:

```bash
minus-tracker stress-test
```

Questo comando genera 100 file CSV di test in una directory temporanea, esegue i vari comandi della CLI su ciascuno di essi e mostra i risultati del test senza modificare i file del tuo progetto.

### Opzioni disponibili

| Flag                  | Default                           | Descrizione                                      |
| --------------------- | --------------------------------- | ------------------------------------------------ |
| `--range N-M`         | `1-100`                           | Esegue solo gli scenari da N a M                 |
| `--keep`              | disattivato                       | Mantiene i file CSV generati dopo il test        |
| `--json`              | disattivato                       | Restituisce i risultati in formato JSON          |
| `--output-dir <path>` | `/tmp/minus-tracker-stress-<ts>/` | Permette di personalizzare la cartella di output |

### Scenari coperti

I 100 scenari includono: azioni in EUR/USD/GBP/CHF, divergenze nei calcoli LIFO vs FIFO, consumo parziale dei lotti, portafogli multi-ISIN, gestione dei giorni festivi (fallback sui tassi BCE del weekend), messaggi di avviso ed errore, operazioni effettuate nello stesso giorno (same-day), casi limite di arrotondamento e portafogli di grandi dimensioni (fino a 200 transazioni).

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
- **Two-bucket classification** (Bucket A/B) of financial instruments — stocks, ETFs, government
  bonds, derivatives — with automatic OpenFIGI-backed classification and a persistent JSON sidecar
- **Modello Redditi PF** generation: Quadro RT (capital gains) and Quadro RM (capital income) built
  from the calculated lots, with prior-year loss carryforward (4-year rule)
- Test suite based on **Agenzia Entrate FAQ**
- Output in **Italian** (default) or **English** (`--lang en`)
- minus-tracker is an NPM package with CLI support

**New in v0.8.0:**

- **Stateless mode for `Classifier`**: `classify()` can now run with zero filesystem access (no
  sidecar file), useful for embedding in agents/automations
- **MCP server** (`minus-tracker-mcp`): exposes `parse_transactions`, `classify_instruments`, and
  `calculate_gains` as MCP tools over stdio, for direct use by AI agents — see the
  [MCP Server](#mcp-server) section below

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

### Example Output

Running `calc` on the sample file produces:

```
METHOD: LIFO | TAX YEAR: 2024

ISIN            PRODUCT                 QTY  BUY DATE      SELL DATE            BUY EUR       SELL EUR          GAIN/LOSS
US0378331005    Apple Inc                10  2024-01-02    2024-01-05          1,371.11       1,188.37            -182.75
NL0010273215    ASML Holding N.V.         3  2024-04-01    2024-07-15          2,552.00       2,849.00            +297.00
NL0010273215    ASML Holding N.V.         3  2024-01-15    2024-07-15          2,401.20       2,849.00            +447.80

────────────────────────────────────────────────────────────────────────
PLUSVALENZE:    744.80 EUR
MINUSVALENZE:  182.75 EUR
NET RESULT: 562.05 EUR
```

Add `--json` to get the raw `GainsReport` object — useful for programmatic integrations (see [Library Usage](#library-usage)).

### DEGIRO CSV Format

Export from **Activity → Transactions** (NOT the Account Statement) in your DEGIRO account. Use the default export with all columns selected.

Supported currencies: **EUR** (no conversion), **USD**, **GBP**, **CHF** (bundled ECB historical rates, 2019–present).

Dates in the DEGIRO export are in `DD-MM-YYYY` format; the parser converts them to ISO automatically.

Rows with a missing ISIN, unsupported currency, or no ECB rate within 3 trading days of the trade date are skipped with a warning (not an error) — run `validate` to inspect them before calculating.

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

| Command                | Key flags                                                                                                                         | Notes                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `calc <file.csv>`      | `--method LIFO\|FIFO` (default: LIFO), `--lang it\|en`, `--json`, `--export-dichiarazione [path]`, `--carry-forward`, `--offline` | Never fetches ECB rates on its own — run `rates --update` periodically. If no `*.classify.json` sidecar is found, auto-classifies instruments (interactively if a terminal is attached, otherwise offline with a warning) and writes it to disk                                                                                            |
| `classify <file.csv>`  | `--offline`                                                                                                                       | Explicit/optional invocation: classifies instruments (Bucket A/B) and creates/updates the `*.classify.json` sidecar. `calc` calls this automatically when needed; use this command to run it ahead of time or to get the interactive confirm flow. Requires an interactive terminal (TTY), or the `--offline` flag in scripted/CI contexts |
| `validate <file.csv>`  | `--lang it\|en`                                                                                                                   | Exit 0 with warnings; exit 1 on hard errors                                                                                                                                                                                                                                                                                                |
| `rates --check`        | —                                                                                                                                 | Shows bundled ECB snapshot coverage                                                                                                                                                                                                                                                                                                        |
| `rates --update`       | —                                                                                                                                 | Fetches fresh rates from the ECB API                                                                                                                                                                                                                                                                                                       |
| `config --lang it\|en` | —                                                                                                                                 | Saves language preference                                                                                                                                                                                                                                                                                                                  |
| `config --show`        | —                                                                                                                                 | Shows current language setting                                                                                                                                                                                                                                                                                                             |
| `stress-test`          | `--range N-M`, `--keep`, `--json`, `--output-dir`                                                                                 | Documented below                                                                                                                                                                                                                                                                                                                           |

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

### Library Installation

```bash
npm install @gabrielerandelli/minus-tracker
```

### Library Usage

```ts
import {
  DEGIROParser,
  Calculator,
  Classifier,
  ParseError,
  CalculationError,
} from "@gabrielerandelli/minus-tracker";
import type { GainsReport, LotMethod } from "@gabrielerandelli/minus-tracker";

// 1. Parse
const parser = new DEGIROParser();
const transactions = parser.parse(csvString); // throws ParseError on bad CSV
if (parser.warnings.length > 0) {
  console.warn("Skipped rows:", parser.warnings);
}

// 2. Classify (Bucket A/B) — optional, enables Quadro RT/RM in the report
const classification = await new Classifier().classify(
  transactions,
  "trades.classify.json", // persistent sidecar; omit for stateless mode
);

// 3. Calculate
const method: LotMethod = "LIFO"; // or "FIFO"
const report: GainsReport = new Calculator(transactions, parser.warnings, {
  classification,
}).calculateGains(method);

console.log(report.plusvalenze); // EUR capital gains (number)
console.log(report.minusvalenze); // EUR capital losses (number, absolute value)
console.log(report.netResult); // plusvalenze - minusvalenze
console.log(report.lots); // MatchedLot[] — per-lot breakdown
console.log(report.dichiarazione); // Quadro RT/RM, when classification was passed

// 4. Error handling
try {
  const txs = parser.parse(csvString);
  const r = new Calculator(txs, parser.warnings).calculateGains("LIFO");
} catch (err) {
  if (err instanceof ParseError) {
    if (err.code === "MISSING_COLUMN") {
      console.error("Missing column:", err.columnName);
    } else {
      console.error("Invalid CSV");
    }
  } else if (err instanceof CalculationError) {
    console.error(`SELL without prior BUY: ${err.isin} on ${err.date}`);
  }
}
```

> **Note:** `parser.warningEntries` (visible in TypeScript autocomplete) is an internal API used by the CLI renderer. Use `parser.warnings` (`string[]`) for library consumers.

minus-tracker is **pure tax math** — no UI, auth, database, or PDF.

**Prerequisites:** Node.js ≥ 24 ([nodejs.org](https://nodejs.org))

### MCP Server

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

The server exposes 3 tools:

| Tool                   | Description                                                           |
| ---------------------- | --------------------------------------------------------------------- |
| `parse_transactions`   | Parses a DEGIRO CSV into `transactions`/`warnings`/`incomeRows`       |
| `classify_instruments` | Classifies ISINs into Bucket A/B (stateless mode — no sidecar file)   |
| `calculate_gains`      | Calculates gains/losses (LIFO/FIFO) and, when available, Quadro RT/RM |

`classify_instruments` supports `existingClassification`, `overrides`, and `offline: true` to run
without network access or filesystem access — designed to be called repeatedly by an agent across
multiple calls, with state kept client-side.

### FAQ / Troubleshooting

**My CSV is rejected with "missing column" or "invalid CSV"**
Confirm you exported from Activity → **Transactions**, not the Account Statement. The parser requires the Transactions export format.

**Some rows are skipped with a warning**
Rows are skipped (without aborting the calculation) when: the ISIN is empty, the currency is not EUR/USD/GBP/CHF, or no ECB rate exists within 3 trading days of the trade date. Run `validate` for details.

**Error "no open lots for ISIN X on date Y"**
The CSV contains a SELL for a position that has no prior BUY in the same file. The BUY may be in a prior year's export that was not included. Use `validate` to inspect the parsed transactions.

**ECB rates are outdated**
Run `minus-tracker rates --update`. The `calc` command never fetches rates on its own — refreshing is always an explicit, user-invoked action.

**LIFO or FIFO?**
LIFO is the standard lot-matching method under Italian tax law for the Regime Dichiarativo. FIFO is available for comparison or other jurisdictions. Consult your tax advisor for confirmation.

### Known Limitations

minus-tracker aggregates gains and losses from **all financial instruments into a single total**, regardless of their tax category.

Italian law requires that **redditi diversi** (individual stocks, derivatives, certificates — Art. 67 TUIR) and **redditi di capitale** (ETFs / UCITS funds — Art. 44 TUIR) be kept separate: a loss on an ETF cannot offset a gain on a stock, and vice versa.

**Portfolios holding only stocks or only ETFs:** the calculation is correct.
**Mixed portfolios (stocks + ETFs):** the reported net result cannot be used directly for tax filing. In this case, lots must be manually separated by tax category before filing, with the help of a qualified tax advisor.

### Disclaimer

minus-tracker is a **personal project** developed in a private capacity and is **not affiliated with, endorsed by, or representative of the author's employer or any other organisation**.

This tool is provided **solely as a calculation aid** and **does not constitute tax, legal, or financial advice**. The author **accepts no liability** for errors in the output, misuse of the tool, or any decisions made by end users based on the generated reports.

You are **always** encouraged to review results with a qualified tax advisor before filing any return.

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
