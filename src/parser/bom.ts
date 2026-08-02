/**
 * Strip a leading UTF-8 byte-order-mark character (U+FEFF) from a string, if
 * present. Common with CSVs re-saved via Excel on Windows.
 */
export function stripBom(input: string): string {
  if (input.charCodeAt(0) === 0xfeff) {
    return input.slice(1);
  }
  return input;
}
