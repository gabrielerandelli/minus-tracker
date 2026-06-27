/**
 * DEGIRO CSV Generator for stress testing
 * Converts manifest scenarios into DEGIRO-format CSV strings.
 */

/**
 * A single transaction from the manifest
 */
export interface ManifestTransaction {
  date: string; // YYYY-MM-DD
  product: string;
  isin: string;
  qty: number; // positive = BUY, negative = SELL
  price: number;
  currency: string; // EUR | USD | GBP | CHF
  fee: number; // absolute EUR fee
}

/**
 * Expected outcomes for a scenario
 */
export interface ManifestExpect {
  calc_exit: number;
  fifo_exit: number;
  json_exit: number;
  en_exit: number;
  validate_exit: number;
  warning_count: number;
}

/**
 * A single test scenario
 */
export interface ManifestScenario {
  id: string;
  category: string;
  slug: string;
  description: string;
  transactions: ManifestTransaction[];
  expect: ManifestExpect;
  special?: string;
}

/**
 * The full stress test manifest
 */
export interface StressManifest {
  version: string;
  ecb_reference_dates: Record<string, unknown>;
  scenarios: ManifestScenario[];
}

/**
 * Convert a date from YYYY-MM-DD to DD-MM-YYYY
 */
function formatDate(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split("-");
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Generate a DEGIRO-format CSV string for a given scenario.
 *
 * DEGIRO CSV format (18 columns, exact order):
 * Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,
 * Local value currency,Value,Value currency,Exchange rate,Transaction costs,
 * Transaction costs currency,Total,Total currency,Order ID
 *
 * Returns the CSV content as a string (header + data rows, joined by \n)
 */
export function generateCsv(scenario: ManifestScenario): string {
  // Handle special cases
  if (scenario.special === "invalid_csv") {
    // Return garbage bytes (invalid CSV)
    return "NOT_A_CSV\x00\x01\x02\ngarbage data";
  }

  // For normal and column-removal cases, build the header first
  const allColumns = [
    "Date",
    "Time",
    "Product",
    "ISIN",
    "Exchange",
    "Execution centre",
    "Quantity",
    "Price",
    "Local value",
    "Local value currency",
    "Value",
    "Value currency",
    "Exchange rate",
    "Transaction costs",
    "Transaction costs currency",
    "Total",
    "Total currency",
    "Order ID",
  ];

  // Remove columns based on special field
  let columns = allColumns;
  if (scenario.special === "missing_col_isin") {
    columns = columns.filter((c) => c !== "ISIN");
  } else if (scenario.special === "missing_col_quantity") {
    columns = columns.filter((c) => c !== "Quantity");
  } else if (scenario.special === "missing_col_price") {
    columns = columns.filter((c) => c !== "Price");
  }

  // Helper to build a CSV row, omitting columns as needed
  const buildRow = (
    values: Record<string, string>,
    includeColumns: string[],
  ): string => {
    return includeColumns.map((col) => values[col] ?? "").join(",");
  };

  // Build header
  const header = buildRow({}, columns);
  const rows = [header];

  // Build data rows
  for (let rowIndex = 0; rowIndex < scenario.transactions.length; rowIndex++) {
    const tx = scenario.transactions[rowIndex];

    // Calculate local value: -qty * price
    // For BUY (qty > 0): localValue is negative (money out)
    // For SELL (qty < 0): localValue is positive (money in)
    const localValue = -tx.qty * tx.price;
    const total = localValue - tx.fee;

    const rowValues: Record<string, string> = {
      Date: formatDate(tx.date),
      Time: "09:00",
      Product: tx.product,
      ISIN: tx.isin,
      Exchange: "XEUR",
      "Execution centre": "XEUR",
      Quantity: String(tx.qty),
      Price: tx.price.toFixed(2),
      "Local value": localValue.toFixed(2),
      "Local value currency": tx.currency,
      Value: localValue.toFixed(2),
      "Value currency": "EUR",
      "Exchange rate": "1",
      "Transaction costs": (-Math.abs(tx.fee)).toFixed(2),
      "Transaction costs currency": "EUR",
      Total: total.toFixed(2),
      "Total currency": "EUR",
      "Order ID": `stress-${scenario.id}-${rowIndex}`,
    };

    const row = buildRow(rowValues, columns);
    rows.push(row);
  }

  return rows.join("\n");
}
