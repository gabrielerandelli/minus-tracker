import { ClassificationError } from "../errors.js";
import type {
  AssetClass,
  ClassificationEntry,
  ClassificationMap,
  ClassifyOptions,
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

/**
 * ISO 3166-1 alpha-2 country codes. ISIN prefixes are assigned by national
 * numbering agencies and (with a handful of documented exceptions, see
 * `isCountryCodePrefix` below) are exactly these two-letter country codes —
 * so this doubles as the set of ISIN prefixes that actually identify an
 * issuer's country. Deliberately broader than `GOVT_BOND_WHITELIST`: it only
 * needs to tell "this prefix is some real country" from "this prefix is not
 * a country at all", not which countries are Art. 68 co.5 TUIR-whitelisted.
 */
const ISO_3166_1_ALPHA2 = new Set([
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU",
  "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL",
  "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC",
  "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV",
  "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG",
  "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD",
  "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT",
  "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM",
  "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH",
  "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK",
  "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH",
  "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW",
  "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR",
  "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR",
  "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC",
  "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL",
  "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY",
  "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA",
  "ZM", "ZW",
]);

/**
 * Whether an ISIN's two-letter prefix identifies a real issuer country.
 *
 * ISO 6166 reserves a few two-letter prefixes for securities registered
 * through a numbering agency that is not a national one — most notably
 * `XS`, used for internationally syndicated issues (incl. a large share of
 * sovereign Eurobonds) cleared through Euroclear/Clearstream. Those prefixes
 * say nothing about who issued the security, so they must never be used to
 * infer Art. 68 co.5 TUIR whitelist eligibility.
 */
function isCountryCodePrefix(prefix: string): boolean {
  return ISO_3166_1_ALPHA2.has(prefix);
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

    if (!isCountryCodePrefix(prefix)) {
      // The ISIN prefix is not an issuer country at all (e.g. "XS" =
      // Euroclear/Clearstream international registration — the standard
      // prefix for internationally-placed sovereign Eurobonds), so it
      // cannot answer the Art. 68 co.5 TUIR whitelist question. Guessing
      // either way would be wrong: defaulting to "whitelisted" could claim
      // an unearned 12.5% rate, and falling through to the generic
      // unrecognized-type path would mislabel a real redditi-di-capitale
      // government bond as a Bucket B "Stock" at 0% — hiding it from
      // Quadro RM entirely. Instead, flag it the same way the
      // unrecognized-type branch below does (a warning + manual review)
      // while still correctly recording it as a Bucket A government bond,
      // defaulting to the standard (non-whitelisted) 26% rate, which never
      // overstates the taxpayer's benefit while this is unresolved.
      warnings.push(
        `Government bond ${isin} (${product}) has ISIN prefix "${prefix}", which is not ` +
          `an issuer country code (e.g. "XS" denotes Euroclear/Clearstream international ` +
          `registration, not a country) — Art. 68 co.5 TUIR whitelist status cannot be ` +
          `determined from the ISIN alone. Defaulted to the standard 26% rate (not ` +
          `whitelisted); please verify the issuer's country and classify manually.`,
      );
      return {
        product,
        assetClass: "GovtBondOther",
        bucketGain: "A",
        bucketLoss: "B",
        taxRate: 0.26,
        whiteListed: null,
        confirmedByUser: false,
        source: "openfigi",
      };
    }

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
    `Unrecognized type for ${isin}: ${securityType}. Please classify manually.`,
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

const ASSET_CLASS_DEFAULTS: Record<AssetClass, TypeMapping> = {
  ETF: {
    assetClass: "ETF",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
  },
  Stock: {
    assetClass: "Stock",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  ETC: {
    assetClass: "ETC",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  GovtBondWL: {
    assetClass: "GovtBondWL",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.125,
    whiteListed: true,
  },
  GovtBondOther: {
    assetClass: "GovtBondOther",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: false,
  },
  CorpBond: {
    assetClass: "CorpBond",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  Derivative: {
    assetClass: "Derivative",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  LeverageCert: {
    assetClass: "LeverageCert",
    bucketGain: "B",
    bucketLoss: "B",
    taxRate: 0,
    whiteListed: null,
  },
  CapProtectedCert: {
    assetClass: "CapProtectedCert",
    bucketGain: "A",
    bucketLoss: "B",
    taxRate: 0.26,
    whiteListed: null,
  },
};

/**
 * Builds a user-confirmed `ClassificationEntry` from a caller-supplied
 * `AssetClass` override (v0.8.0 stateless mode). The caller picked the asset
 * class directly, so no ISIN-prefix whitelist lookup is performed here — the
 * caller owns gov-bond-whitelisted-vs-other correctness.
 */
function buildEntryFromAssetClass(
  assetClass: AssetClass,
  product: string,
): ClassificationEntry {
  const mapped = ASSET_CLASS_DEFAULTS[assetClass];
  return {
    product,
    assetClass: mapped.assetClass,
    bucketGain: mapped.bucketGain,
    bucketLoss: mapped.bucketLoss,
    taxRate: mapped.taxRate,
    whiteListed: mapped.whiteListed,
    confirmedByUser: true,
    source: "user",
  };
}

type OpenFIGIItem = { securityType?: string; securityType2?: string };
type OpenFIGIResult = { data?: OpenFIGIItem[]; error?: string };

export class Classifier {
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
    sidecarPath?: string,
    options?: ClassifyOptions,
    _httpPost: HttpPost = httpsPost,
  ): Promise<ClassificationMap> {
    // 1. Deduplicate ISINs; track first product name seen per ISIN
    const isinToProduct = new Map<string, string>();
    for (const tx of transactions) {
      if (tx.isin && !isinToProduct.has(tx.isin)) {
        isinToProduct.set(tx.isin, tx.product);
      }
    }

    // 2. Build the "already resolved" set.
    // Sidecar mode (unchanged v0.6.0 behavior): only confirmedByUser:true
    // entries from disk are trusted; everything else is re-processed.
    // Stateless mode (sidecarPath undefined, v0.8.0): no disk access at
    // all — ALL entries in options.existingClassification are trusted
    // as-is, regardless of confirmedByUser.
    const confirmed: ClassificationMap = {};

    if (sidecarPath !== undefined) {
      if (fs.existsSync(sidecarPath)) {
        const existingMap = await this.load(sidecarPath);
        for (const [isin, entry] of Object.entries(existingMap)) {
          if (entry.confirmedByUser) {
            confirmed[isin] = entry;
          }
        }
      }
    } else if (options?.existingClassification) {
      Object.assign(confirmed, options.existingClassification);
    }

    // overrides always win, in both modes, and are never sent to OpenFIGI
    for (const [isin, assetClass] of Object.entries(options?.overrides ?? {})) {
      const product = isinToProduct.get(isin) ?? isin;
      confirmed[isin] = buildEntryFromAssetClass(assetClass, product);
    }

    // 3. ISINs that need (re-)processing: not already resolved
    const toProcess: string[] = [];
    for (const isin of isinToProduct.keys()) {
      if (!(isin in confirmed)) {
        toProcess.push(isin);
      }
    }

    // 4. Batch-query OpenFIGI (skipped entirely in offline mode)
    const warnings: string[] = [];
    const newEntries: ClassificationMap = {};

    if (options?.offline) {
      for (const isin of toProcess) {
        const product = isinToProduct.get(isin) ?? isin;
        warnings.push(
          `Unrecognized type for ${isin}: unknown. Please classify manually.`,
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
      }
    } else {
      const BATCH_SIZE = 10;
      const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);

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
              `Unrecognized type for ${isin}: unknown. Please classify manually.`,
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

        const batchIndex = i / BATCH_SIZE;
        options?.onBatchProgress?.(batchIndex + 1, totalBatches);
      }
    }

    // 5. Merge: confirmed/overrides entries take precedence and remain untouched
    const mergedMap: ClassificationMap = { ...newEntries, ...confirmed };

    // 6. Write sidecar — only in sidecar mode; stateless mode never touches disk
    if (sidecarPath !== undefined) {
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
    }

    return mergedMap;
  }
}
