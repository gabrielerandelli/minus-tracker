import type { LocaleStrings } from "./types.js";

export const it: LocaleStrings = {
  numberLocale: "it-IT",

  errorInvalidCsv: "CSV non valido: impossibile analizzare il file",
  errorMissingColumn: (col) => `Colonna obbligatoria mancante: ${col}`,
  errorNoOpenLots: (isin, date) =>
    `Nessun lotto aperto per ISIN ${isin} in data ${date}`,

  warnMissingIsin: (row) => `Riga ${row}: ISIN mancante — riga ignorata`,
  warnUnsupportedCurrency: (row, currency) =>
    `Riga ${row}: valuta non supportata ${currency} — riga ignorata`,
  warnNoEcbRate: (row, currency, date) =>
    `Riga ${row}: nessun tasso BCE per ${currency} in data ${date} — riga ignorata`,
  warnQuantityZero: (row) => `Riga ${row}: quantità pari a 0 — riga ignorata`,

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

  configLangSet: (lang) => `Lingua impostata su: ${lang}`,
  configCurrentLang: (lang) => `Lingua corrente: ${lang}`,

  disclaimer: "minus-tracker è un ausilio al calcolo, non consulenza fiscale.",
};
