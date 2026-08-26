import { describe, it, expect, afterEach } from "vitest";
import { Calculator } from "../src/calculator/index.js";
import type {
  Transaction,
  ClassificationMap,
  IncomeRow,
} from "../src/types.js";

/**
 * Regression: income rows dated exactly at a UTC-day boundary (e.g. the first
 * day of the tax year) must not be dropped from the dichiarazione report
 * because of the host machine's local timezone.
 *
 * `row.date` is a plain ISO "YYYY-MM-DD" string. `new Date(row.date)` parses
 * a date-only string as UTC midnight (per the ECMAScript spec), but
 * `.getFullYear()` reads the year back in the HOST MACHINE'S LOCAL timezone,
 * not UTC. In any timezone with a negative UTC offset (e.g. America/New_York,
 * UTC-5), a row dated exactly "2024-01-01" gets reinterpreted as local time
 * "2023-12-31 19:00", so `.getFullYear()` returns 2023 instead of 2024. The
 * row was then silently dropped from the tax-year filter and never appeared
 * in `report.dichiarazione.quadroRM.dividendiEsteri` / `.cedole`, while a
 * misleading "Income rows outside tax year ... were skipped." warning was
 * pushed even though the row genuinely belonged to that tax year.
 *
 * The fix extracts the year via pure string slicing on the ISO date string
 * (`row.date.slice(0, 4)`), mirroring `inferTaxYear()` in the same file,
 * instead of constructing a `Date` object at all. This is deterministic
 * regardless of the host machine's timezone.
 */

const ISIN = "IE00B4L5Y983";

const transactions: Transaction[] = [
  {
    isin: ISIN,
    product: "iShares Core MSCI World",
    date: "2024-01-05",
    type: "BUY",
    quantity: 10,
    pricePerUnit: 10,
    currency: "EUR",
    totalLocal: -100,
    totalEUR: 100,
    feesEUR: 0,
  },
  {
    isin: ISIN,
    product: "iShares Core MSCI World",
    date: "2024-06-05",
    type: "SELL",
    quantity: 10,
    pricePerUnit: 12,
    currency: "EUR",
    totalLocal: 120,
    totalEUR: 120,
    feesEUR: 0,
  },
];

const classification: ClassificationMap = {
  [ISIN]: {
    product: "iShares Core MSCI World",
    assetClass: "ETF",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
    confirmedByUser: true,
    source: "user",
  },
};

// Dated exactly on the tax-year's UTC-day boundary (Jan 1st) — the case that
// misbehaved under negative-UTC-offset timezones.
const incomeRows: IncomeRow[] = [
  {
    isin: ISIN,
    product: "iShares Core MSCI World",
    date: "2024-01-01",
    incomeType: "dividend",
    grossAmount: 50,
    withholdingTax: 0,
    currency: "EUR",
  },
];

function runCalculator() {
  return new Calculator(transactions, [], {
    classification,
    incomeRows,
  }).calculateGains("LIFO");
}

describe("regression: income-row tax-year filter must not depend on host timezone", () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  // Node/V8 reads process.env.TZ lazily on each Date computation (no caching
  // across the process), so flipping it mid-process reliably changes
  // Date-based local-time behavior within a single vitest run. Verified
  // empirically: with the pre-fix `new Date(row.date).getFullYear()` logic,
  // this test fails exactly under negative-UTC-offset zones like
  // America/New_York and passes under UTC — the runtime does pick up the
  // change immediately, so no separate-process workaround is needed here.
  it("keeps a Jan 1st dividend row under a negative-UTC-offset timezone (America/New_York)", () => {
    process.env.TZ = "America/New_York";

    const report = runCalculator();

    expect(report.warnings).not.toContain(
      "Income rows outside tax year 2024 were skipped.",
    );
    expect(report.dichiarazione?.quadroRM.dividendiEsteri).toHaveLength(1);
    expect(report.dichiarazione?.quadroRM.dividendiEsteri[0]).toMatchObject({
      isin: ISIN,
      lordo: 50,
    });
  });

  it("keeps the same Jan 1st dividend row under UTC (control case)", () => {
    process.env.TZ = "UTC";

    const report = runCalculator();

    expect(report.warnings).not.toContain(
      "Income rows outside tax year 2024 were skipped.",
    );
    expect(report.dichiarazione?.quadroRM.dividendiEsteri).toHaveLength(1);
  });

  it("keeps the row under a positive-UTC-offset timezone too (Asia/Tokyo, UTC+9)", () => {
    process.env.TZ = "Asia/Tokyo";

    const report = runCalculator();

    expect(report.warnings).not.toContain(
      "Income rows outside tax year 2024 were skipped.",
    );
    expect(report.dichiarazione?.quadroRM.dividendiEsteri).toHaveLength(1);
  });

  it("correctly excludes a genuinely out-of-year row (Dec 31 of the prior year), regardless of timezone", () => {
    process.env.TZ = "America/New_York";

    const outOfYearIncomeRows: IncomeRow[] = [
      {
        isin: ISIN,
        product: "iShares Core MSCI World",
        date: "2023-12-31",
        incomeType: "dividend",
        grossAmount: 50,
        withholdingTax: 0,
        currency: "EUR",
      },
    ];

    const report = new Calculator(transactions, [], {
      classification,
      incomeRows: outOfYearIncomeRows,
    }).calculateGains("LIFO");

    expect(report.warnings).toContain(
      "Income rows outside tax year 2024 were skipped.",
    );
    expect(report.dichiarazione?.quadroRM.dividendiEsteri).toHaveLength(0);
  });
});
