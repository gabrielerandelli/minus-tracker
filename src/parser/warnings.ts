export type WarningEntry =
  | { code: "MISSING_ISIN"; row: number }
  | { code: "UNSUPPORTED_CURRENCY"; row: number; currency: string }
  | { code: "NO_ECB_RATE"; row: number; currency: string; date: string }
  | { code: "QUANTITY_ZERO"; row: number }
  | { code: "MISSING_ISIN_INCOME"; row: number }
  | { code: "ORPHAN_WITHHOLDING"; isin: string; date: string };

export function warningToEnglish(w: WarningEntry): string {
  switch (w.code) {
    case "MISSING_ISIN":
      return `Row ${w.row}: missing ISIN — skipped`;
    case "UNSUPPORTED_CURRENCY":
      return `Row ${w.row}: unsupported currency ${w.currency} — skipped`;
    case "NO_ECB_RATE":
      return `Row ${w.row}: no ECB rate for ${w.currency} on ${w.date} — skipped`;
    case "QUANTITY_ZERO":
      return `Row ${w.row}: quantity is 0 — skipped`;
    case "MISSING_ISIN_INCOME":
      return `Row ${w.row}: blank ISIN on income row — skipped`;
    case "ORPHAN_WITHHOLDING":
      return `Withholding row for ${w.isin} on ${w.date}: no matching income row — skipped`;
  }
}
