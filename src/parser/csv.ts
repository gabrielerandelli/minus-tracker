/**
 * Parse a single CSV line, respecting RFC-4180-style double-quote escaping.
 * Does not support embedded newlines in fields (not needed for DEGIRO exports).
 */
export function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= line.length) {
    // End of line — stop (handles trailing comma by not emitting extra empty field)
    if (i === line.length) break;

    if (line[i] === '"') {
      // Quoted field
      let field = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && i + 1 < line.length && line[i + 1] === '"') {
          // Escaped double-quote
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (i < line.length && line[i] === ",") i++; // skip delimiter
    } else {
      // Unquoted field
      const start = i;
      while (i < line.length && line[i] !== ",") i++;
      fields.push(line.slice(start, i));
      if (i < line.length) i++; // skip delimiter
    }
  }

  return fields;
}

/**
 * Parse a full CSV string (CRLF or LF line endings) into a 2-D array of strings.
 */
export function parseCSV(input: string): string[][] {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split("\n").map(parseCSVRow);
}
