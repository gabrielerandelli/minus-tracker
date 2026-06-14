# minus-tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Strumento open-source TypeScript (libreria + CLI) per il calcolo automatico di
**plusvalenze e minusvalenze** (_Regime Dichiarativo_) — abbinamento lotti LIFO/FIFO,
normalizzazione multi-valuta con tassi BCE storici, parsing del CSV DEGIRO.

> Open-source TypeScript library + CLI that automates **Italian capital-gains/loss
> calculation** (_Regime Dichiarativo_) — LIFO/FIFO lot matching, multi-currency
> normalisation (historical ECB rates), and DEGIRO CSV parsing.

> **Stato / Status:** Pre-spec bootstrap. Vedi [`docs/idea.md`](./docs/idea.md) per la visione.

---

## Cosa fa / What it does

- Calcolo plusvalenze/minusvalenze — abbinamento lotti **LIFO e FIFO** (configurabile)
  _(Capital-gains/loss calculation — configurable **LIFO and FIFO** lot matching)_
- **Parser CSV DEGIRO** (estensibile ad altri broker via PR della community)
  _(DEGIRO CSV parser, extensible to other brokers via community PRs)_
- Gestione **multi-valuta** con tassi BCE storici (EUR, USD, GBP, CHF)
  _(Multi-currency handling with historical ECB rates)_
- Terminologia italiana: _plusvalenze_, _minusvalenze_, _Regime Dichiarativo_
- Suite di test basata su **FAQ Agenzia Entrate** (baseline di correttezza)
  _(Test suite based on **Agenzia Entrate FAQ** as the correctness baseline)_
- Uscita in **italiano** (predefinita) o **inglese** (`--lang en`)
  _(Output in **Italian** (default) or **English** (`--lang en`))_
- Libreria npm + CLI
  _(npm library + CLI)_

---

## Utilizzo rapido / Quick start

```ts
import { DEGIROParser, Calculator } from "minus-tracker";

const transactions = new DEGIROParser().parse(csv);
const report = new Calculator(transactions).calculateGains("LIFO"); // o "FIFO"
```

minus-tracker è **solo calcolo fiscale** — nessuna UI, autenticazione, database o PDF.
È il motore standalone del Tax Hub di [Olos](https://github.com/gabrielerandelli/Olos),
ma funziona in modo indipendente.

_minus-tracker is **pure tax math** — no UI, auth, database, or PDF. It is the standalone
engine behind [Olos](https://github.com/gabrielerandelli/Olos)'s Tax Hub, but works
independently._

---

## CLI

```bash
# Calcola plusvalenze/minusvalenze (uscita in italiano, predefinita)
# Calculate gains/losses (Italian output, default)
minus-tracker calc trades.csv

# Uscita in inglese / English output
minus-tracker calc --lang en trades.csv

# Imposta la lingua in modo permanente / Set language permanently
minus-tracker config --lang en   # oppure / or: --lang it

# Valida il CSV senza calcolare / Validate CSV without calculating
minus-tracker validate trades.csv

# Controlla/aggiorna i tassi BCE / Check/update ECB rates
minus-tracker rates --check
minus-tracker rates --update
```

---

## Installazione / Installation

```bash
npm install minus-tracker
```

_(Non ancora pubblicato — in arrivo con v0.5.0. / Not yet published — coming with v0.5.0.)_

---

## Avvertenza / Disclaimer

minus-tracker è un **ausilio al calcolo, non consulenza fiscale**. I risultati sono
destinati alla revisione e alla consegna a un commercialista qualificato.

_A **calculation aid, not tax advice**. Outputs are intended for review and handoff to a
qualified commercialista._

---

## Licenza / License

[MIT](./LICENSE) © 2026 Gabriele Randelli
