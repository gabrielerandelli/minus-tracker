export class ParseError extends Error {
  readonly code: "INVALID_CSV" | "MISSING_COLUMN" | "MISSING_SECTION";
  readonly columnName?: string;
  readonly sectionName?: string;

  constructor(code: "INVALID_CSV");
  constructor(code: "MISSING_COLUMN", columnName: string);
  constructor(code: "MISSING_SECTION", sectionName: string);
  constructor(code: ParseError["code"], columnOrSectionName?: string) {
    const msg =
      code === "INVALID_CSV"
        ? "Invalid CSV: unable to parse"
        : code === "MISSING_COLUMN"
          ? `Missing required column: ${columnOrSectionName}`
          : `Missing required section: ${columnOrSectionName}`;
    super(msg);
    this.name = "ParseError";
    this.code = code;
    this.columnName =
      code === "MISSING_COLUMN" ? columnOrSectionName : undefined;
    this.sectionName =
      code === "MISSING_SECTION" ? columnOrSectionName : undefined;
  }
}

export class CalculationError extends Error {
  // v0.11.2 — AMBIGUOUS_TAX_YEAR added alongside the pre-existing (now
  // implicit) NO_OPEN_LOTS case. v0.13.2 — INVALID_TAX_RATE added: a Bucket A
  // (redditi di capitale) gain whose classification.taxRate is not exactly
  // 0.26 or 0.125 (the only two rates Italian tax law recognizes for this
  // bucket, per Art. 68 co. 5 TUIR) is invalid/corrupt input — e.g. a typo in
  // a hand-edited *.classify.json sidecar, or a bug in code that builds a
  // ClassificationMap outside this library — and must be rejected loudly
  // rather than silently disappearing from buildQuadroRM's fixed
  // capitaleAliquota26/capitaleAliquota125 fields. Same discriminated-by-
  // .code, optional-field pattern ParseError already uses above, not a new
  // shape (see docs/prd/07-error-handling.md's compatibility note).
  //
  // v0.13.4 — INVALID_QUANTITY added: Transaction.quantity (src/types.ts) is
  // documented as "always positive" — an explicit invariant of the public
  // contract — but a buggy upstream broker-adapter (e.g. a community PR per
  // AGENTS.md's "extensible to other brokers" note) can map a raw signed
  // Quantity column straight through without taking Math.abs(), producing a
  // non-positive quantity. Previously this was never validated: a
  // non-positive SELL made the matching `while (remainingSellQty > 0)` loop
  // a complete no-op, silently dropping the whole transaction (and leaving
  // its matching open BUY lot dangling) with zero diagnostic trail — real
  // gains simply vanished from the tax report. A non-positive BUY is worse:
  // it injects a negative-quantity open lot that can corrupt a LATER SELL's
  // matching (Math.min(lot.quantity, remainingSellQty) with a negative
  // lot.quantity yields a negative matchedQty, which can make
  // remainingSellQty grow instead of shrink). Both must be rejected loudly,
  // consistent with NO_OPEN_LOTS/INVALID_TAX_RATE above.
  readonly code:
    | "NO_OPEN_LOTS"
    | "AMBIGUOUS_TAX_YEAR"
    | "INVALID_TAX_RATE"
    | "INVALID_QUANTITY";
  readonly isin?: string; // present when code === "NO_OPEN_LOTS" | "INVALID_TAX_RATE" | "INVALID_QUANTITY"
  readonly date?: string; // present when code === "NO_OPEN_LOTS" or "INVALID_QUANTITY"
  readonly years?: number[]; // ascending, deduped; present only when code === "AMBIGUOUS_TAX_YEAR"
  readonly taxRate?: number; // present only when code === "INVALID_TAX_RATE"
  readonly quantity?: number; // present only when code === "INVALID_QUANTITY"
  readonly transactionType?: "BUY" | "SELL"; // present only when code === "INVALID_QUANTITY"

  constructor(isin: string, date: string);
  constructor(code: "AMBIGUOUS_TAX_YEAR", years: number[]);
  constructor(code: "INVALID_TAX_RATE", isin: string, taxRate: number);
  constructor(
    code: "INVALID_QUANTITY",
    isin: string,
    date: string,
    quantity: number,
    transactionType: "BUY" | "SELL",
  );
  constructor(
    isinOrCode: string,
    dateOrYearsOrIsin: string | number[],
    taxRateOrDate?: number | string,
    quantity?: number,
    transactionType?: "BUY" | "SELL",
  ) {
    if (Array.isArray(dateOrYearsOrIsin)) {
      const years = dateOrYearsOrIsin;
      super(
        // v0.13.3 — wording kept transport-neutral (not "--year"): this
        // message reaches MCP callers verbatim via toCalculationErrorResult
        // (src/mcp/errors.ts), who have no CLI flag to act on. The CLI's own
        // rendering (src/cli/commands/calc.ts) never uses this string — it
        // renders the localized errorAmbiguousTaxYear(years) message instead,
        // which still names --year for that surface.
        `Transactions span multiple tax years (${years.join(", ")}) — specify a tax year (e.g. the taxYear option, or the CLI's --year flag) to resolve the ambiguity`,
      );
      this.name = "CalculationError";
      this.code = "AMBIGUOUS_TAX_YEAR";
      this.years = years;
    } else if (
      isinOrCode === "INVALID_TAX_RATE" &&
      typeof taxRateOrDate === "number"
    ) {
      const isin = dateOrYearsOrIsin;
      const taxRate = taxRateOrDate;
      super(
        `Bucket A (redditi di capitale) classification for ISIN ${isin} has ` +
          `invalid taxRate ${taxRate} — must be exactly 0.26 or 0.125`,
      );
      this.name = "CalculationError";
      this.code = "INVALID_TAX_RATE";
      this.isin = isin;
      this.taxRate = taxRate;
    } else if (
      isinOrCode === "INVALID_QUANTITY" &&
      typeof taxRateOrDate === "string" &&
      quantity !== undefined &&
      transactionType !== undefined
    ) {
      const isin = dateOrYearsOrIsin;
      const date = taxRateOrDate;
      super(
        `${transactionType} transaction for ISIN ${isin} on ${date} has non-positive ` +
          `quantity ${quantity} — Transaction.quantity must always be positive`,
      );
      this.name = "CalculationError";
      this.code = "INVALID_QUANTITY";
      this.isin = isin;
      this.date = date;
      this.quantity = quantity;
      this.transactionType = transactionType;
    } else {
      const isin = isinOrCode;
      const date = dateOrYearsOrIsin as string;
      super(`No open lots for ISIN ${isin} on ${date}`);
      this.name = "CalculationError";
      this.code = "NO_OPEN_LOTS";
      this.isin = isin;
      this.date = date;
    }
  }
}

export class ClassificationError extends Error {
  readonly code:
    | "NETWORK_ERROR"
    | "SIDECAR_NOT_FOUND"
    | "SIDECAR_VERSION"
    | "SIDECAR_MALFORMED"
    | "WRITE_ERROR";

  constructor(code: ClassificationError["code"], message?: string) {
    super(
      message ??
        (code === "SIDECAR_NOT_FOUND"
          ? "Sidecar file not found"
          : code === "SIDECAR_VERSION"
            ? "Sidecar version mismatch"
            : code === "SIDECAR_MALFORMED"
              ? "Sidecar file is malformed JSON"
              : code === "NETWORK_ERROR"
                ? "Network error contacting OpenFIGI"
                : "Failed to write sidecar file"),
    );
    this.name = "ClassificationError";
    this.code = code;
  }
}
