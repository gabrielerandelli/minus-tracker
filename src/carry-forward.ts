/**
 * Shared eligibility rule for prior-year Bucket-B carry-forward losses
 * (Art. 68 co.5 TUIR): a loss realized in `entryYear` may offset gains in a
 * report computed for `taxYear` only if it was realized 1 to 4 tax years
 * before that report — i.e. `1 <= taxYear - entryYear <= 4`.
 *
 * An entry dated the same year as the report, or in a future year relative
 * to it, is treated exactly like an expired (too-old) entry: not eligible.
 *
 * Kept as a single internal helper (not part of the package's public API —
 * not re-exported from src/index.ts) so Calculator.calculateGains
 * (src/calculator/index.ts) and buildQuadroRT (src/dichiarazione/engine.ts)
 * can never independently drift on this rule again.
 */
export function isCarryForwardEligible(
  taxYear: number,
  entryYear: number,
): boolean {
  const gap = taxYear - entryYear;
  return gap >= 1 && gap <= 4;
}
