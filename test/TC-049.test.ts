import { describe, it, expect, vi, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { Transaction } from "../src/types.js";
import { Classifier } from "../src/classifier/index.js";

const tempSidecar = path.join(
  os.tmpdir(),
  `tc-049-${Date.now()}.classify.json`,
);

afterEach(() => {
  if (fs.existsSync(tempSidecar)) {
    fs.unlinkSync(tempSidecar);
  }
});

const tx: Transaction = {
  isin: "US1234567890",
  product: "Some Preferred Stock",
  date: "2024-01-10",
  type: "BUY",
  quantity: 5,
  pricePerUnit: 50,
  currency: "USD",
  totalLocal: -250,
  totalEUR: 230,
  feesEUR: 1,
  fxRate: 1.086,
};

describe("TC-049: unknown OpenFIGI securityType → source=user, confirmedByUser=false", () => {
  it("returns entry with source=user when OpenFIGI type is unrecognized", async () => {
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([{ data: [{ securityType: "Preferred Stock" }] }]),
    });

    const classifier = new Classifier({ interactive: false });
    const map = await classifier.classify([tx], tempSidecar, undefined, mockHttp);

    const entry = map["US1234567890"];
    expect(entry).toBeDefined();
    expect(entry!.source).toBe("user");
    expect(entry!.confirmedByUser).toBe(false);
  });

  it("sidecar file is still written for unknown types", async () => {
    const mockHttp = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify([{ data: [{ securityType: "Preferred Stock" }] }]),
    });

    const classifier = new Classifier({ interactive: false });
    await classifier.classify([tx], tempSidecar, undefined, mockHttp);

    expect(fs.existsSync(tempSidecar)).toBe(true);
    const raw = fs.readFileSync(tempSidecar, "utf-8");
    const parsed = JSON.parse(raw) as { warnings?: string[] };
    // Warnings about unrecognized type should be recorded in the sidecar
    expect(Array.isArray(parsed.warnings)).toBe(true);
    expect(parsed.warnings!.some((w) => w.includes("Preferred Stock"))).toBe(
      true,
    );
  });
});
