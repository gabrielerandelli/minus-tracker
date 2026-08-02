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
  | { code: "QUANTITY_ZERO"; row: number }
  | { code: "MISSING_ISIN_INCOME"; row: number }
  | { code: "ORPHAN_WITHHOLDING"; isin: string; date: string }
  | { code: "UNMATCHED_WITHHOLDING"; row: number; section: IBKRSection };

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
      return `Row ${w.row}: quantity is 0 — skipped`;
    case "MISSING_ISIN_INCOME":
      return `Row ${w.row}: blank ISIN on income row — skipped`;
    case "ORPHAN_WITHHOLDING":
      return `Withholding row for ${w.isin} on ${w.date}: no matching income row — skipped`;
    case "UNMATCHED_WITHHOLDING":
      return `${w.section} row ${w.row}: withholding tax with no matching income row — skipped`;
  }
}
