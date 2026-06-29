import { ClassificationError } from "../errors.js";
import type {
  AssetClass,
  ClassificationEntry,
  ClassificationMap,
  Transaction,
} from "../types.js";
import * as fs from "node:fs";
import * as https from "node:https";

type HttpPost = (
  url: string,
  body: string,
  timeoutMs: number,
) => Promise<{ status: number; data: string }>;

function httpsPost(
  url: string,
  body: string,
  timeoutMs: number,
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, data }));
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const GOVT_BOND_WHITELIST = new Set([
  "IT",
  "DE",
  "FR",
  "AT",
  "BE",
  "NL",
  "ES",
  "PT",
  "FI",
  "IE",
  "LU",
  "GR",
  "SK",
  "SI",
  "LT",
  "LV",
  "EE",
  "MT",
  "CY",
  "US",
  "GB",
  "CH",
  "NO",
  "SE",
  "DK",
  "JP",
  "CA",
  "AU",
  "NZ",
  "SG",
  "HK",
  "KR",
]);

type TypeMapping = {
  assetClass: AssetClass;
  bucketGain: "A" | "B";
  bucketLoss: "A" | "B";
  taxRate: number;
  whiteListed: boolean | null;
};

const SECURITY_TYPE_MAP: Record<string, TypeMapping> = {
  ETP: {
    assetClass: "ETF",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
  },
  ETF: {
    assetClass: "ETF",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
  },
  "Mutual Fund": {
    assetClass: "ETF",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
  },
  "Open-End Fund": {
    assetClass: "ETF",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
  },
  "Common Stock": {
    assetClass: "Stock",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  Equity: {
    assetClass: "Stock",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  "Exchange Traded Commodity": {
    assetClass: "ETC",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  "Corporate Bond": {
    assetClass: "CorpBond",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  Option: {
    assetClass: "Derivative",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  Future: {
    assetClass: "Derivative",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  Warrant: {
    assetClass: "Derivative",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  CFD: {
    assetClass: "Derivative",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  Swap: {
    assetClass: "Derivative",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  "Leverage Certificate": {
    assetClass: "LeverageCert",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  "Turbo Certificate": {
    assetClass: "LeverageCert",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  "Capital Protected Certificate": {
    assetClass: "CapProtectedCert",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
  },
};

function isKnownType(t: string): boolean {
  return t === "Government Bond" || t in SECURITY_TYPE_MAP;
}

function classifyByType(
  isin: string,
  securityType: string,
  product: string,
  warnings: string[],
): ClassificationEntry {
  if (securityType === "Government Bond") {
    const prefix = isin.slice(0, 2).toUpperCase();
    const whiteListed = GOVT_BOND_WHITELIST.has(prefix);
    return {
      product,
      assetClass: whiteListed ? "GovtBondWL" : "GovtBondOther",
      bucketGain: "A",
      bucketLoss: "B",
      taxRate: whiteListed ? 0.125 : 0.26,
      whiteListed,
      confirmedByUser: false,
      source: "openfigi",
    };
  }

  const mapped = SECURITY_TYPE_MAP[securityType];
  if (mapped) {
    return {
      product,
      assetClass: mapped.assetClass,
      bucketGain: mapped.bucketGain,
      bucketLoss: mapped.bucketLoss,
      taxRate: mapped.taxRate,
      whiteListed: mapped.whiteListed,
      confirmedByUser: false,
      source: "openfigi",
    };
  }

  // Unknown type — flag for manual review
  warnings.push(
    `Unrecognized type: ${securityType}. Please classify manually.`,
  );
  return {
    product,
    assetClass: "Stock",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
    confirmedByUser: false,
    source: "user",
  };
}

type OpenFIGIItem = { securityType?: string; securityType2?: string };
type OpenFIGIResult = { data?: OpenFIGIItem[]; error?: string };

export class Classifier {
  private readonly interactive: boolean;

  constructor(options?: { interactive?: boolean }) {
    this.interactive = options?.interactive ?? true;
  }

  async load(sidecarPath: string): Promise<ClassificationMap> {
    if (!fs.existsSync(sidecarPath)) {
      throw new ClassificationError("SIDECAR_NOT_FOUND");
    }

    let parsed: unknown;
    try {
      const raw = fs.readFileSync(sidecarPath, "utf-8");
      parsed = JSON.parse(raw);
    } catch {
      throw new ClassificationError("SIDECAR_MALFORMED");
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as Record<string, unknown>)["version"] !== 1
    ) {
      throw new ClassificationError("SIDECAR_VERSION");
    }

    return (parsed as { classifications: ClassificationMap }).classifications;
  }

  async classify(
    transactions: Transaction[],
    sidecarPath: string,
    _httpPost: HttpPost = httpsPost,
  ): Promise<ClassificationMap> {
    // 1. Deduplicate ISINs; track first product name seen per ISIN
    const isinToProduct = new Map<string, string>();
    for (const tx of transactions) {
      if (tx.isin && !isinToProduct.has(tx.isin)) {
        isinToProduct.set(tx.isin, tx.product);
      }
    }

    // 2. Load existing sidecar; separate confirmed from to-process
    const confirmed: ClassificationMap = {};

    if (fs.existsSync(sidecarPath)) {
      const existingMap = await this.load(sidecarPath);
      for (const [isin, entry] of Object.entries(existingMap)) {
        if (entry.confirmedByUser) {
          confirmed[isin] = entry;
        }
      }
    }

    // 3. ISINs that need (re-)processing: not user-confirmed
    const toProcess: string[] = [];
    for (const isin of isinToProduct.keys()) {
      if (!(isin in confirmed)) {
        toProcess.push(isin);
      }
    }

    // 4. Batch-query OpenFIGI
    const warnings: string[] = [];
    const newEntries: ClassificationMap = {};
    const BATCH_SIZE = 10;

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      // Wait 6 s between consecutive batch requests
      if (i > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 6000));
      }

      const batch = toProcess.slice(i, i + BATCH_SIZE);
      const requestBody = JSON.stringify(
        batch.map((isin) => ({ idType: "ID_ISIN", idValue: isin })),
      );

      let response: { status: number; data: string } | null = null;

      // Try once; retry once on 5xx
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await _httpPost(
            "https://api.openfigi.com/v3/mapping",
            requestBody,
            10_000,
          );
          if (r.status < 500) {
            response = r;
            break;
          }
          // 5xx — loop will retry once
        } catch {
          // Network-level error — no retry
          throw new ClassificationError("NETWORK_ERROR");
        }
      }

      if (response === null) {
        throw new ClassificationError("NETWORK_ERROR");
      }

      const results = JSON.parse(response.data) as OpenFIGIResult[];

      for (let j = 0; j < batch.length; j++) {
        const isin = batch[j]!;
        const result = results[j];
        const product = isinToProduct.get(isin) ?? isin;

        if (
          !result ||
          result.error ||
          !result.data ||
          result.data.length === 0
        ) {
          warnings.push(
            `Unrecognized type: unknown. Please classify manually.`,
          );
          newEntries[isin] = {
            product,
            assetClass: "Stock",
            bucketGain: "B",
            bucketLoss: "B",
            taxRate: 0,
            whiteListed: null,
            confirmedByUser: false,
            source: "user",
          };
          continue;
        }

        const st = result.data[0]?.securityType;
        const st2 = result.data[0]?.securityType2;

        // Prefer the type that resolves to a known mapping
        const typeToUse =
          st && isKnownType(st)
            ? st
            : st2 && isKnownType(st2)
              ? st2
              : (st ?? st2 ?? "Unknown");

        newEntries[isin] = classifyByType(isin, typeToUse, product, warnings);
      }
    }

    // 5. Merge: confirmed entries take precedence and remain untouched
    const mergedMap: ClassificationMap = { ...newEntries, ...confirmed };

    // 6. Write sidecar
    const sidecarContent = JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        classifications: mergedMap,
        warnings,
      },
      null,
      2,
    );

    try {
      fs.writeFileSync(sidecarPath, sidecarContent, "utf-8");
    } catch {
      throw new ClassificationError("WRITE_ERROR");
    }

    return mergedMap;
  }
}
