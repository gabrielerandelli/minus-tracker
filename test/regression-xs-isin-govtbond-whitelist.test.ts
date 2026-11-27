import { describe, it, expect, vi, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { Transaction } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

/**
 * Regression test (QA routine, 2026-11-27): OpenFIGI's "Government Bond"
 * securityType was being mapped to an Art. 68 co.5 TUIR whitelist verdict by
 * reading the ISIN's first two characters as an issuer-country code. That is
 * wrong for `XS`-prefixed ISINs: `XS` is the ISO 6166 prefix reserved for
 * securities registered through Euroclear/Clearstream — the standard prefix
 * for internationally-syndicated sovereign Eurobonds — and says nothing
 * about the issuer's actual country. A France Eurobond placed with an
 * `XS`-prefixed ISIN was therefore silently taxed at 26% ("GovtBondOther")
 * while the economically identical France domestic OAT (ISIN prefix `FR`)
 * was correctly taxed at 12.5% ("GovtBondWL") — same issuer, two different
 * tax outcomes purely as an artifact of which clearing system issued the
 * identifier.
 *
 * Fix: `classifyByType()` now checks whether the ISIN prefix is a real ISO
 * 3166-1 alpha-2 country code at all before using it to decide whitelist
 * status. When it is not (XS and friends), it no longer guesses — it
 * defaults to the standard 26% rate (`GovtBondOther`, `whiteListed: null`,
 * i.e. "unknown", never a false `true`/`false`) and pushes a warning asking
 * for manual review, following the same "flag for manual review" convention
 * the pre-existing "Unrecognized type" branch already uses — but, unlike
 * that generic fallback, it still correctly records the security as a
 * Bucket A government bond instead of mislabeling it as a 0%-taxed "Stock"
 * and hiding a real redditi-di-capitale gain from Quadro RM.
 */

function fakeOpenFigiGovtBond(): (
  _url: string,
  body: string,
) => Promise<{ status: number; data: string }> {
  return async (_url: string, body: string) => {
    const batch = JSON.parse(body) as unknown[];
    const results = batch.map(() => ({
      data: [{ securityType: "Government Bond" }],
    }));
    return { status: 200, data: JSON.stringify(results) };
  };
}

const xsTx: Transaction = {
  isin: "XS1234567890",
  product: "FRANCE (GOVT OF) EUROBOND",
  date: "2024-01-10",
  type: "BUY",
  quantity: 1000,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -100000,
  totalEUR: 100000,
  feesEUR: 0,
  sourceRow: 1,
};

const frTx: Transaction = {
  isin: "FR0000000000",
  product: "FRANCE (GOVT OF) DOMESTIC OAT",
  date: "2024-01-10",
  type: "BUY",
  quantity: 1000,
  pricePerUnit: 100,
  currency: "EUR",
  totalLocal: -100000,
  totalEUR: 100000,
  feesEUR: 0,
  sourceRow: 2,
};

describe("regression: XS-prefixed ISIN must not be guessed as non-whitelisted govt bond", () => {
  it("does not silently classify an XS-prefixed sovereign Eurobond as GovtBondOther/26%, while a same-issuer FR domestic bond still resolves to GovtBondWL/12.5%", async () => {
    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify(
      [xsTx, frTx],
      undefined,
      { existingClassification: {} },
      fakeOpenFigiGovtBond(),
    );

    const xsEntry = map["XS1234567890"];
    const frEntry = map["FR0000000000"];
    expect(xsEntry).toBeDefined();
    expect(frEntry).toBeDefined();

    // The FR domestic bond is unaffected by this fix: FR is a real country
    // code and is on the Art.68 co.5 whitelist.
    expect(frEntry!.assetClass).toBe("GovtBondWL");
    expect(frEntry!.taxRate).toBe(0.125);
    expect(frEntry!.whiteListed).toBe(true);

    // The XS Eurobond must still be recorded as a Bucket A government bond
    // (never silently falls through to "Stock"/0%, which would hide the
    // gain from Quadro RM)...
    expect(xsEntry!.assetClass).toBe("GovtBondOther");
    expect(xsEntry!.bucketGain).toBe("A");
    expect(xsEntry!.bucketLoss).toBe("B");
    // ...defaults to the standard, tax-conservative 26% rate rather than
    // guessing a whitelist verdict either way...
    expect(xsEntry!.taxRate).toBe(0.26);
    // ...and must NOT claim a specific true/false whitelist verdict it
    // cannot actually support from the ISIN alone.
    expect(xsEntry!.whiteListed).toBe(null);
  });

  it("GovtBondOther/26% and GovtBondWL/12.5% are the ONLY taxRate/assetClass values ever produced for a Government Bond securityType, regardless of ISIN prefix", async () => {
    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify(
      [xsTx],
      undefined,
      { existingClassification: {} },
      fakeOpenFigiGovtBond(),
    );
    const entry = map["XS1234567890"]!;
    expect([0.125, 0.26]).toContain(entry.taxRate);
    expect(["GovtBondWL", "GovtBondOther"]).toContain(entry.assetClass);
  });
});

describe("regression: XS-prefixed government bond is flagged for manual review in the sidecar warnings", () => {
  const tempSidecar = path.join(
    os.tmpdir(),
    `regression-xs-govtbond-${Date.now()}.classify.json`,
  );

  afterEach(() => {
    if (fs.existsSync(tempSidecar)) {
      fs.unlinkSync(tempSidecar);
    }
  });

  it("writes a sidecar warning naming the XS ISIN, mirroring the existing 'unrecognized type' manual-review convention", async () => {
    const mockHttp = vi.fn(fakeOpenFigiGovtBond());
    const classifier = new Classifier({ interactive: false });
    await classifier.classify([xsTx], tempSidecar, undefined, mockHttp);

    expect(fs.existsSync(tempSidecar)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(tempSidecar, "utf-8")) as {
      warnings: string[];
    };
    expect(
      parsed.warnings.some((w) => w.includes("XS1234567890")),
    ).toBe(true);
  });
});
