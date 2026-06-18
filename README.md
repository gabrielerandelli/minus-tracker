# minus-tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **Status:** v0.5.0 — published on GitHub Packages as `@gabrielerandelli/minus-tracker`.

---

## Italiano

Strumento open-source TypeScript (libreria + CLI) per il calcolo automatico di
**plusvalenze e minusvalenze** nel _Regime Dichiarativo_ — abbinamento lotti LIFO/FIFO,
normalizzazione multi-valuta con tassi BCE storici, parsing del CSV DEGIRO.

### Cosa fa

- Calcolo plusvalenze/minusvalenze con abbinamento lotti **LIFO e FIFO** (configurabile)
- **Parser CSV DEGIRO** (estensibile ad altri broker via PR della community)
- Gestione **multi-valuta** con tassi BCE storici (EUR, USD, GBP, CHF)
- Terminologia italiana: _plusvalenze_, _minusvalenze_, _Regime Dichiarativo_
- Suite di test basata su **FAQ Agenzia Entrate** (baseline di correttezza fiscale)
- Uscita in **italiano** (predefinita) o **inglese** (`--lang en`)
- Libreria npm + CLI

### Utilizzo rapido

```ts
import { DEGIROParser, Calculator } from "@gabrielerandelli/minus-tracker";

const transactions = new DEGIROParser().parse(csv);
const report = new Calculator(transactions).calculateGains("LIFO"); // o "FIFO"
```

minus-tracker è **solo calcolo fiscale** — nessuna UI, autenticazione, database o PDF.

### CLI

```bash
# Calcola plusvalenze/minusvalenze (uscita in italiano, predefinita)
minus-tracker calc trades.csv

# Uscita in inglese
minus-tracker calc --lang en trades.csv

# Imposta la lingua in modo permanente
minus-tracker config --lang en   # oppure: --lang it

# Valida il CSV senza calcolare
minus-tracker validate trades.csv

# Controlla/aggiorna i tassi BCE
minus-tracker rates --check
minus-tracker rates --update
```

### Installazione

```bash
# Configurazione una-tantum: indirizza lo scope @gabrielerandelli a GitHub Packages
echo "@gabrielerandelli:registry=https://npm.pkg.github.com" >> ~/.npmrc

npm install @gabrielerandelli/minus-tracker
```

### Avvertenza

minus-tracker è un **ausilio al calcolo, non consulenza fiscale**. I risultati sono
destinati alla revisione e alla consegna a un commercialista qualificato.

---

## English

Open-source TypeScript library + CLI that automates **Italian capital-gains/loss
calculation** (_Regime Dichiarativo_) — LIFO/FIFO lot matching, multi-currency
normalisation (historical ECB rates), and DEGIRO CSV parsing.

### What it does

- Capital-gains/loss calculation with configurable **LIFO and FIFO** lot matching
- **DEGIRO CSV parser**, extensible to other brokers via community PRs
- **Multi-currency** handling with historical ECB rates (EUR, USD, GBP, CHF)
- Test suite based on **Agenzia Entrate FAQ** as the correctness baseline
- Output in **Italian** (default) or **English** (`--lang en`)
- npm library + CLI

### Quick start

```ts
import { DEGIROParser, Calculator } from "@gabrielerandelli/minus-tracker";

const transactions = new DEGIROParser().parse(csv);
const report = new Calculator(transactions).calculateGains("LIFO"); // or "FIFO"
```

minus-tracker is **pure tax math** — no UI, auth, database, or PDF.

### CLI

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

### Installation

```bash
# One-time setup: point the @gabrielerandelli scope to GitHub Packages
echo "@gabrielerandelli:registry=https://npm.pkg.github.com" >> ~/.npmrc

npm install @gabrielerandelli/minus-tracker
```

### Disclaimer

A **calculation aid, not tax advice**. Outputs are intended for review and handoff to a
qualified commercialista (_Italian tax professional_).

---

## License

[MIT](./LICENSE) © 2026 Gabriele Randelli
