# minus-tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/@gabrielerandelli/minus-tracker.svg)](https://www.npmjs.com/package/@gabrielerandelli/minus-tracker)

---

## Italiano

minus-tracker è un progetto open-source sviluppato principalmente in TypeScript per il calcolo automatico di **plusvalenze e minusvalenze** in _Regime Dichiarativo_. Gestisce la sincronizzazione dei lotti tramite logica LIFO/FIFO e la normalizzazione multivaluta utilizzando i tassi storici della BCE.

Il tool elabora i dati partendo direttamente dal formato CSV esportato da DEGIRO.

### Funzionalità

- Calcolo di plusvalenze e minusvalenze con gestione dei lotti via **LIFO o FIFO** (configurabile)
- **Parser integrato** per i file CSV di DEGIRO
- Gestione **multivaluta** con tassi storici BCE (EUR, USD, GBP, CHF)
- Suite di test allineata alle **FAQ dell'Agenzia delle Entrate**
- Output disponibile in **italiano** (default) o **inglese** (`--lang en`)
- Disponibile come pacchetto NPM con supporto CLI

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

| Comando                | Flag principali                                                  | Note                                                                   |
| ---------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `calc <file.csv>`      | `--method LIFO\|FIFO` (default: LIFO), `--lang it\|en`, `--json` | Aggiorna i tassi BCE automaticamente se la snapshot ha più di 7 giorni |
| `validate <file.csv>`  | `--lang it\|en`                                                  | Exit 0 con avvisi; exit 1 in caso di errori bloccanti                  |
| `rates --check`        | —                                                                | Mostra la copertura della snapshot BCE in locale                       |
| `rates --update`       | —                                                                | Scarica i tassi aggiornati dall'API BCE                                |
| `config --lang it\|en` | —                                                                | Salva la lingua preferita                                              |
| `config --show`        | —                                                                | Mostra la lingua correntemente impostata                               |
| `stress-test`          | `--range N-M`, `--keep`, `--json`, `--output-dir`                | Documentato in fondo                                                   |

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

// 2. Calcolo
const method: LotMethod = "LIFO"; // oppure "FIFO"
const report: GainsReport = new Calculator(
  transactions,
  parser.warnings,
).calculateGains(method);

console.log(report.plusvalenze); // numero in EUR
console.log(report.minusvalenze); // numero in EUR (valore assoluto)
console.log(report.netResult); // plusvalenze - minusvalenze
console.log(report.lots); // MatchedLot[] — dettaglio per lotto

// 3. Gestione errori
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

### Domande frequenti

**Il CSV viene rifiutato con "colonna mancante" o "CSV non valido"**
Verifica di aver esportato da Attività → **Transazioni** e non dal rendiconto del conto. Il parser richiede il formato dell'export Transazioni.

**Alcune righe vengono saltate con un avviso**
Le righe vengono saltate (senza bloccare il calcolo) quando: l'ISIN è vuoto, la valuta non è tra EUR/USD/GBP/CHF, oppure non esiste un tasso BCE entro 3 giorni lavorativi dalla data dell'operazione. Usa `validate` per i dettagli.

**Errore "nessun lotto aperto per ISIN X alla data Y"**
Il CSV contiene una vendita per un titolo senza un acquisto precedente nel file. L'acquisto potrebbe essere in un export di un anno precedente non incluso. Usa `validate` per esaminare le transazioni parsate.

**I tassi BCE sono scaduti**
Esegui `minus-tracker rates --update`. Il comando `calc` esegue l'aggiornamento automaticamente se la snapshot ha più di 7 giorni.

**LIFO o FIFO?**
Il Regime Dichiarativo utilizza il LIFO come metodo predefinito ai sensi della normativa fiscale italiana. Il FIFO è disponibile per confronto. Consulta il tuo commercialista per conferma.

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

| Command                | Key flags                                                        | Notes                                                      |
| ---------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `calc <file.csv>`      | `--method LIFO\|FIFO` (default: LIFO), `--lang it\|en`, `--json` | Auto-fetches ECB rates if snapshot is more than 7 days old |
| `validate <file.csv>`  | `--lang it\|en`                                                  | Exit 0 with warnings; exit 1 on hard errors                |
| `rates --check`        | —                                                                | Shows bundled ECB snapshot coverage                        |
| `rates --update`       | —                                                                | Fetches fresh rates from the ECB API                       |
| `config --lang it\|en` | —                                                                | Saves language preference                                  |
| `config --show`        | —                                                                | Shows current language setting                             |
| `stress-test`          | `--range N-M`, `--keep`, `--json`, `--output-dir`                | Documented below                                           |

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

// 2. Calculate
const method: LotMethod = "LIFO"; // or "FIFO"
const report: GainsReport = new Calculator(
  transactions,
  parser.warnings,
).calculateGains(method);

console.log(report.plusvalenze); // EUR capital gains (number)
console.log(report.minusvalenze); // EUR capital losses (number, absolute value)
console.log(report.netResult); // plusvalenze - minusvalenze
console.log(report.lots); // MatchedLot[] — per-lot breakdown

// 3. Error handling
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

### FAQ / Troubleshooting

**My CSV is rejected with "missing column" or "invalid CSV"**
Confirm you exported from Activity → **Transactions**, not the Account Statement. The parser requires the Transactions export format.

**Some rows are skipped with a warning**
Rows are skipped (without aborting the calculation) when: the ISIN is empty, the currency is not EUR/USD/GBP/CHF, or no ECB rate exists within 3 trading days of the trade date. Run `validate` for details.

**Error "no open lots for ISIN X on date Y"**
The CSV contains a SELL for a position that has no prior BUY in the same file. The BUY may be in a prior year's export that was not included. Use `validate` to inspect the parsed transactions.

**ECB rates are outdated**
Run `minus-tracker rates --update`. The `calc` command also auto-updates if the snapshot is more than 7 days old.

**LIFO or FIFO?**
LIFO is the standard lot-matching method under Italian tax law for the Regime Dichiarativo. FIFO is available for comparison or other jurisdictions. Consult your tax advisor for confirmation.

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
