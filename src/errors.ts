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
  // implicit) NO_OPEN_LOTS case. Same discriminated-by-.code, optional-field
  // pattern ParseError already uses above, not a new shape (see
  // docs/prd/07-error-handling.md's compatibility note).
  readonly code: "NO_OPEN_LOTS" | "AMBIGUOUS_TAX_YEAR";
  readonly isin?: string; // present only when code === "NO_OPEN_LOTS"
  readonly date?: string; // present only when code === "NO_OPEN_LOTS"
  readonly years?: number[]; // ascending, deduped; present only when code === "AMBIGUOUS_TAX_YEAR"

  constructor(isin: string, date: string);
  constructor(code: "AMBIGUOUS_TAX_YEAR", years: number[]);
  constructor(isinOrCode: string, dateOrYears: string | number[]) {
    if (Array.isArray(dateOrYears)) {
      const years = dateOrYears;
      super(
        `Transactions span multiple tax years (${years.join(", ")}) — specify --year`,
      );
      this.name = "CalculationError";
      this.code = "AMBIGUOUS_TAX_YEAR";
      this.years = years;
    } else {
      const isin = isinOrCode;
      const date = dateOrYears;
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
