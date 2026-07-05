import type { LocaleStrings } from "./types.js";

export const it: LocaleStrings = {
  numberLocale: "it-IT",

  errorInvalidCsv: "CSV non valido: impossibile analizzare il file",
  errorMissingColumn: (col) => `Colonna obbligatoria mancante: ${col}`,
  errorNoOpenLots: (isin, date) =>
    `Nessun lotto aperto per ISIN ${isin} in data ${date}`,
  errorCannotReadFile: (path) => `Impossibile leggere il file: ${path}`,
  errorCannotLoadSidecar: (path) => `Impossibile caricare il sidecar: ${path}`,
  errorCannotWriteExport: (path) =>
    `Impossibile scrivere l'export della dichiarazione: ${path}`,

  warnMissingIsin: (row) => `Riga ${row}: ISIN mancante — riga ignorata`,
  warnUnsupportedCurrency: (row, currency) =>
    `Riga ${row}: valuta non supportata ${currency} — riga ignorata`,
  warnNoEcbRate: (row, currency, date) =>
    `Riga ${row}: nessun tasso BCE per ${currency} in data ${date} — riga ignorata`,
  warnQuantityZero: (row) => `Riga ${row}: quantità pari a 0 — riga ignorata`,
  warnMissingIsinIncome: (row) =>
    `Riga ${row}: ISIN mancante su riga di reddito — riga ignorata`,
  warnOrphanWithholding: (isin, date) =>
    `Riga di ritenuta su ${isin}/${date} senza riga di reddito corrispondente — riga ignorata`,

  warnMultipleYears:
    "Il CSV contiene transazioni di più anni — filtra per un singolo anno per un calcolo accurato.",

  headerMethod: "METODO",
  headerTaxYear: "ANNO FISCALE",
  headerIsin: "ISIN",
  headerProduct: "TITOLO",
  headerQty: "QTÀ",
  headerBuyDate: "DATA ACQUISTO",
  headerSellDate: "DATA VENDITA",
  headerBuyEur: "ACQUISTO EUR",
  headerSellEur: "VENDITA EUR",
  headerGainLoss: "GUADAGNO/PERDITA",

  summaryPlusvalenze: "PLUSVALENZE",
  summaryMinusvalenze: "MINUSVALENZE",
  summaryNetResult: "RISULTATO NETTO",
  summaryWarnings: "AVVERTENZE",
  summaryGenerated: "Generato",

  validateOk: (count, errors) =>
    `OK: ${count} transazioni analizzate, ${errors} errori gravi`,
  validateWarn: (count, reason) =>
    `AVVISO: ${count} righe ignorate (${reason})`,

  ratesCoverage: (start, end, currencies) =>
    `Copertura: ${start} → ${end} | Valute: ${currencies}`,
  ratesGapsNone: "Lacune: nessuna",
  ratesGaps: (list) => `Lacune: ${list}`,
  ratesUpdateFetching: "Recupero dati BCE SDMX in corso...",
  ratesUpdateDone: (n) => `Completato. Aggiunte ${n} nuove date.`,
  ratesSnapshotWritten: (path) => `Snapshot scritto in ${path}`,
  ratesAutoUpdateStart:
    "Le rate BCE non sono aggiornate. Aggiornamento automatico in corso...",
  ratesAutoUpdateFailed:
    "Aggiornamento automatico fallito. Si procede con le rate disponibili.",

  configLangSet: (lang) => `Lingua impostata su: ${lang}`,
  configCurrentLang: (lang) => `Lingua corrente: ${lang}`,

  classifyStarting: (n) => `Classificazione ISIN in corso... (${n} strumenti)`,
  classifyDetected: (isin, product, bucket, rate) =>
    `Rilevato: ${product} (${isin}) → ${bucket} | ${rate}`,
  classifyConfirm: "[Y/n/?]: ",
  classifyOverridePrompt: "Tipo di strumento:",
  classifyDone: (confirmed, total) =>
    `Classificazione completata (${confirmed}/${total} confermati).`,
  classifyWritten: (path) => `Scritto: ${path}`,
  classifyMergePrompt: (existing) =>
    `File già esistente (${existing} ISIN confermati). Aggiungere i nuovi ISIN? [Y/n]: `,
  classifyOfflineWarning: "Modalità offline: ricerca OpenFIGI saltata.",
  classifyUnknownType: (type) =>
    `Tipo non riconosciuto: ${type}. Classificare manualmente.`,
  classifyNonTtyError:
    "Modalità interattiva richiede un terminale (TTY). Usa --offline per classificare senza terminale.",

  bucketAHeader: "BUCKET A — REDDITI DA CAPITALE (non compensabili)",
  bucketBHeader: "BUCKET B — REDDITI DIVERSI",
  bucketAEtf: "ETF (OICR)",
  bucketABtpWl: "BTP/WL",
  bucketATotalTax: "TOTALE IMPOSTA",
  bucketBCarryApplied: (year) => `RIPORTO ${year}`,
  bucketBResult: "RISULTATO",
  bucketBCarryNote: "(riportabile ai prossimi 4 anni)",
  warnMixedBuckets:
    "Le perdite in Bucket B non compensano le plusvalenze in Bucket A.",
  warnMixedAssets:
    "AVVISO: CSV contiene tipi di strumenti misti (es. ETF + Azioni).\n" +
    "   Il calcolo a bucket unico può non essere fiscalmente corretto.\n" +
    "   Esegui: minus-tracker classify trades.csv",
  headerBucket: "BUCKET",
  warnUnclassifiedIsin: (isin) =>
    `ISIN ${isin} non trovato nella mappa di classificazione — assegnato a Bucket B.`,
  carryForwardInvalidFormat:
    "Formato --carry-forward non valido. Usa: AAAA:importo (es. 2023:2500)",

  disclaimer: "minus-tracker è un ausilio al calcolo, non consulenza fiscale.",

  // v0.7.0 dichiarazione section
  dichiarazioneHeader: (anno) =>
    `── MODELLO REDDITI PF [ANNO D'IMPOSTA: ${anno}]`,
  dichiarazioneNota:
    "Nota: i valori riportano i codici riga indicativi — verificare la modulistica ufficiale.",
  dichiarazioneWarningRow:
    "⚠  I codici riga tra parentesi quadre sono indicativi. Verificare la versione corrente del modello.",
  quadroRTHeader: "QUADRO RT — SEZIONE II (redditi diversi)",
  quadroRTPlusvalenze: "[RT-P]  Plusvalenze totali",
  quadroRTMinusvalenze: "[RT-M]  Minusvalenze totali",
  quadroRTDifferenza: "[RT-D]  Differenza",
  quadroRTRiporto: (anno) => `[RT-C*] Riporto ${anno} (consumato)`,
  quadroRTImponibile: "[RT-N]  Imponibile netto",
  quadroRTImposta: "[RT-I]  Imposta (26%)",
  quadroRTRiportabile: "[RT-R]  Minusvalenze da riportare",
  quadroRTPerdita: "perdita netta:",
  quadroRMHeader: "QUADRO RM (redditi da capitale)",
  quadroRMEtf26: "[RM-A1] ETF/OICR plusvalenze (26%)",
  quadroRMImposta: "Imposta sostitutiva",
  quadroRMBtp: "[RM-A2] BTP/WL plusvalenze (12,5%)",
  quadroRMDividendi: "[RM-D]  Dividendi esteri lordi",
  quadroRMRitenuta: "Ritenuta estera (credito)",
  quadroRMCedole: "[RM-C]  Cedole obbligazionarie",
  dichiarazioneDisclaimer:
    "minus-tracker è un ausilio al calcolo, non consulenza fiscale.",
  warnNoDichiarazioneSidecar:
    "Suggerimento: esegui prima 'minus-tracker classify <file>' per abilitare il Quadro RT/RM.",
  warnNoCarryForwardProvided: "(eventuali perdite pregresse non applicate)",
};
