// Section names for IBKR's multi-section CSV format — never translated,
// same convention as column names.
type IBKRSection = "Trades" | "Dividends" | "Withholding Tax" | "Interest";

export type WarningEntry =
  | { code: "MISSING_ISIN"; row: number; section?: IBKRSection }
  | {
      code: "UNSUPPORTED_CURRENCY";
      row: number;
      currency: string;
      section?: IBKRSection;
    }
  | {
      code: "NO_ECB_RATE";
      row: number;
      currency: string;
      date: string;
      section?: IBKRSection;
    }
  | { code: "QUANTITY_ZERO"; row: number; section?: IBKRSection }
  | { code: "NEGATIVE_TRADE_PRICE"; row: number; section?: IBKRSection }
  | {
      code: "INVALID_BUY_SELL";
      row: number;
      value: string;
      section?: IBKRSection;
    }
  | {
      // A trade's fee/commission is non-zero but its currency cell was left
      // blank (as opposed to naming an unrecognized currency). Rather than
      // dropping the whole transaction, the parser assumes the fee is in the
      // trade's own (already-resolved) currency and keeps the row — this
      // warning flags that assumption so the user can double check their
      // broker export.
      code: "FEE_CURRENCY_ASSUMED";
      row: number;
      currency: string;
      section?: IBKRSection;
    }
  | { code: "MISSING_ISIN_INCOME"; row: number }
  | { code: "ORPHAN_WITHHOLDING"; isin: string; date: string }
  | { code: "UNMATCHED_WITHHOLDING"; row: number; section: IBKRSection }
  | {
      // The same ISIN appears across more than one distinct AssetCategory
      // value in the Trades section's Data rows (e.g. a STK row and an OPT
      // row sharing the underlying's ISIN — common in real IBKR exports,
      // which often leave an option's own ISIN blank and some pipelines
      // backfill it with the underlying's). Calculator's lot-matching is
      // keyed purely on isin with no concept of AssetCategory, so left
      // unresolved this would silently cross-match contracts against shares
      // as if 1 unit of one equalled 1 unit of the other. The parser keeps
      // only the "dominant" AssetCategory for that isin (the one with the
      // most Data rows; ties broken by first-AssetCategory-encountered in
      // the file) and drops the rest — this warning names the isin and
      // which AssetCategory was kept vs. dropped, with each side's row
      // count so the "why" (dominance by row count, or the tie-break) is
      // visible without re-reading the file.
      code: "MIXED_ASSET_CATEGORY_ISIN";
      isin: string;
      keptCategory: string;
      droppedCategory: string;
      keptRows: number;
      droppedRows: number;
      section?: IBKRSection;
    };

export function warningToEnglish(w: WarningEntry): string {
  switch (w.code) {
    case "MISSING_ISIN":
      return w.section
        ? `${w.section} row ${w.row}: missing ISIN — skipped`
        : `Row ${w.row}: missing ISIN — skipped`;
    case "UNSUPPORTED_CURRENCY":
      return w.section
        ? `${w.section} row ${w.row}: unsupported currency ${w.currency} — skipped`
        : `Row ${w.row}: unsupported currency ${w.currency} — skipped`;
    case "NO_ECB_RATE":
      return w.section
        ? `${w.section} row ${w.row}: no ECB rate for ${w.currency} on ${w.date} — skipped`
        : `Row ${w.row}: no ECB rate for ${w.currency} on ${w.date} — skipped`;
    case "QUANTITY_ZERO":
      return w.section
        ? `${w.section} row ${w.row}: quantity is 0 — skipped`
        : `Row ${w.row}: quantity is 0 — skipped`;
    case "NEGATIVE_TRADE_PRICE":
      return w.section
        ? `${w.section} row ${w.row}: negative TradePrice settlement is not supported in this release — skipped (handle this trade manually)`
        : `Row ${w.row}: negative TradePrice settlement is not supported in this release — skipped (handle this trade manually)`;
    case "INVALID_BUY_SELL":
      return w.section
        ? `${w.section} row ${w.row}: invalid Buy/Sell value "${w.value}" (expected "BUY" or "SELL") — skipped`
        : `Row ${w.row}: invalid Buy/Sell value "${w.value}" (expected "BUY" or "SELL") — skipped`;
    case "FEE_CURRENCY_ASSUMED":
      return w.section
        ? `${w.section} row ${w.row}: fee currency blank — assumed ${w.currency} (the trade's own currency)`
        : `Row ${w.row}: fee currency blank — assumed ${w.currency} (the trade's own currency)`;
    case "MISSING_ISIN_INCOME":
      return `Row ${w.row}: blank ISIN on income row — skipped`;
    case "ORPHAN_WITHHOLDING":
      return `Withholding row for ${w.isin} on ${w.date}: no matching income row — skipped`;
    case "UNMATCHED_WITHHOLDING":
      return `${w.section} row ${w.row}: withholding tax with no matching income row — skipped`;
    case "MIXED_ASSET_CATEGORY_ISIN": {
      const tieNote =
        w.keptRows === w.droppedRows
          ? " (tie on row count — first AssetCategory encountered in the file was kept)"
          : "";
      return (
        `ISIN ${w.isin}: mixed AssetCategory values in Trades (${w.keptCategory}: ` +
        `${w.keptRows} row(s), ${w.droppedCategory}: ${w.droppedRows} row(s)) — kept ` +
        `${w.keptCategory} as the dominant instrument, dropped ${w.droppedCategory} ` +
        `rows as the minority/likely-unrelated instrument${tieNote}`
      );
    }
  }
}
