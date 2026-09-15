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

⚠️ **Ausilio al calcolo, non consulenza fiscale** — vedi il [Disclaimer](#disclaimer).
⚠️ **Calculation aid only, not tax advice** — see the [Disclaimer](#disclaimer).

🤖 **Novità: server MCP** — qualsiasi agente AI può calcolare plusvalenze/minusvalenze italiane direttamente, senza passare dalla CLI.
🤖 **New: MCP server** — any AI agent can compute Italian capital gains/losses directly, no CLI required.

✅ Validato su tutti i 12 scenari FAQ dell'Agenzia delle Entrate · 628 test automatici · zero dipendenze runtime nella libreria core.
✅ Validated against all 12 Agenzia delle Entrate FAQ scenarios · 628 automated tests · zero runtime dependencies in the core library.

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

📋 Cronologia completa delle versioni: [CHANGELOG.md](./CHANGELOG.md).

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

📋 Full version history: [CHANGELOG.md](./CHANGELOG.md).

---

## Documentation

Le guide seguenti sono in inglese / The following guides are in English:

- [Quick Start](docs/quick-start.md) — try it on the bundled sample file and see example output
- [CSV Formats](docs/csv-formats.md) — preparing a DEGIRO or Interactive Brokers (beta) export
- [CLI Usage](docs/cli-usage.md) — installing and running the `minus-tracker` command, including the built-in stress test
- [Library Usage](docs/library-usage.md) — using minus-tracker as a TypeScript/JavaScript library
- [MCP Server](docs/mcp-server.md) — running `minus-tracker-mcp` for AI agents
- [FAQ / Troubleshooting](docs/faq.md) — common errors and known limitations
- [Architecture](docs/ARCHITECTURE.md) — internal design reference for contributors

See also: [CHANGELOG.md](./CHANGELOG.md), [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md), [agent/README.md](agent/README.md) (example MCP agent).

---

## Disclaimer

**Italiano:** minus-tracker è un **progetto personale** sviluppato a titolo privato e **non è in alcun modo affiliato, sponsorizzato o rappresentativo del datore di lavoro dell'autore o di qualsiasi altra organizzazione**. Il tool è fornito **esclusivamente come ausilio al calcolo** e **non costituisce consulenza fiscale, legale o finanziaria**. L'autore **declina ogni responsabilità** per eventuali errori nei calcoli, per un utilizzo improprio dello strumento o per le decisioni prese dall'utente finale sulla base dei report generati. Si raccomanda **sempre** di verificare i risultati con un commercialista o professionista fiscale qualificato prima di presentare qualsiasi dichiarazione.

**English:** minus-tracker is a **personal project** developed in a private capacity and is **not affiliated with, endorsed by, or representative of the author's employer or any other organisation**. This tool is provided **solely as a calculation aid** and **does not constitute tax, legal, or financial advice**. The author **accepts no liability** for errors in the output, misuse of the tool, or any decisions made by end users based on the generated reports. You are **always** encouraged to review results with a qualified tax advisor before filing any return.

---

## License

[MIT](./LICENSE) © 2026 Gabriele Randelli
