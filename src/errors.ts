export class ParseError extends Error {
  readonly code: "INVALID_CSV" | "MISSING_COLUMN";
  readonly columnName?: string;

  constructor(code: "INVALID_CSV");
  constructor(code: "MISSING_COLUMN", columnName: string);
  constructor(code: ParseError["code"], columnName?: string) {
    const msg =
      code === "INVALID_CSV"
        ? "Invalid CSV: unable to parse"
        : `Missing required column: ${columnName}`;
    super(msg);
    this.name = "ParseError";
    this.code = code;
    this.columnName = columnName;
  }
}

export class CalculationError extends Error {
  readonly isin: string;
  readonly date: string;

  constructor(isin: string, date: string) {
    super(`No open lots for ISIN ${isin} on ${date}`);
    this.name = "CalculationError";
    this.isin = isin;
    this.date = date;
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
