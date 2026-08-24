import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Regression test for the "bundled ECB rates snapshot unresolvable from the
 * published package entry points" bug.
 *
 * getBundledSnapshot() in src/rates/index.ts used to resolve the bundled
 * snapshot's path relative to __dirname assuming the SOURCE tree layout
 * (src/rates/index.ts -> ../data/ecb-rates.json). tsup bundles every entry
 * point into a single flat file, so dist/index.js (depth 0) and
 * dist/index.cjs (where import.meta.url is undefined under cjs output) both
 * failed to resolve the snapshot -- even for a pure-EUR transaction that
 * performs no currency conversion, because getActiveSnapshot() is invoked
 * unconditionally on every parser.parse() call.
 *
 * This test exercises the ACTUAL BUILT dist/ output (not src/), following
 * the pattern used in test/mcp/packaging.test.ts. It assumes `npm run build`
 * has already produced `dist/`.
 */

const HEADER =
  "Date,Time,Product,ISIN,Exchange,Execution centre,Quantity,Price,Local value,Local value currency,Value,Value currency,Exchange rate,Transaction costs,Transaction costs currency,Total,Total currency,Order ID";
const ROW =
  "14-01-2024,09:05,Apple Inc,US0378331005,XNAS,XNAS,10,150.00,-1500.00,EUR,-1500.00,EUR,1,-2.00,EUR,-1502.00,EUR,abc-123";
const PURE_EUR_CSV = [HEADER, ROW].join("\n");

describe("Regression — dist/ entry points resolve the bundled ECB rates snapshot", () => {
  it("Step 1: dist/index.js (ESM, via dynamic import) parses a pure-EUR CSV without throwing", async () => {
    const distIndexUrl = new URL(
      "file://" + path.join(__dirname, "../dist/index.js"),
    ).href;
    const { DEGIROParser } = await import(distIndexUrl);

    expect(() => new DEGIROParser().parse(PURE_EUR_CSV)).not.toThrow();

    const transactions = new DEGIROParser().parse(PURE_EUR_CSV);
    expect(transactions).toHaveLength(1);
  });

  it("Step 2: dist/index.cjs (CJS, via require) parses a pure-EUR CSV without throwing", () => {
    const distCjsPath = path.join(__dirname, "../dist/index.cjs");
    const { DEGIROParser } = require(distCjsPath);

    expect(() => new DEGIROParser().parse(PURE_EUR_CSV)).not.toThrow();

    const transactions = new DEGIROParser().parse(PURE_EUR_CSV);
    expect(transactions).toHaveLength(1);
  });
});
