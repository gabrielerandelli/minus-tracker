import { stripBom } from "../parser/bom.js";

/**
 * Best-effort broker format sniff for the CLI's `--broker` auto-detection.
 *
 * Deliberately does not attempt full CSV parsing or column validation — it
 * only reads raw text to decide which parser (`DEGIROParser`/`IBKRParser`)
 * to instantiate. A `null` result is a normal, expected outcome (an
 * unrelated CSV), not a caller-side bug.
 */
export function detectBroker(csv: string): "degiro" | "ibkr" | null {
  const stripped = stripBom(csv);
  const lines = stripped
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  if (lines[0]?.includes("Local value currency")) {
    return "degiro";
  }

  if (lines.some((line) => /^Trades,Header,/.test(line))) {
    return "ibkr";
  }

  return null;
}
