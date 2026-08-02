export interface WithholdingJoinCandidate {
  key: string;
  grossAmount: number;
}

/**
 * Allocate per-key withholding totals across candidates sharing that key,
 * weighted by each candidate's `grossAmount` share. Used to join withholding
 * rows to income rows in a currency-aware, collision-safe way, shared by
 * `DEGIROParser` and `IBKRParser`.
 *
 * Returns one withholding value per input candidate, in the same order/index
 * as `candidates`. A candidate whose key is absent from `totalsByKey` gets 0.
 * A key with exactly one candidate gets the key's full total; a key shared by
 * multiple candidates splits the total proportionally by grossAmount.
 */
export function allocateWithholding(
  candidates: WithholdingJoinCandidate[],
  totalsByKey: Map<string, number>,
): number[] {
  const groups = new Map<string, number[]>(); // key -> indices into candidates
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i].key;
    const indices = groups.get(key);
    if (indices) {
      indices.push(i);
    } else {
      groups.set(key, [i]);
    }
  }

  const result = new Array<number>(candidates.length).fill(0);

  for (const [key, indices] of groups) {
    const total = totalsByKey.get(key);
    if (total === undefined) continue;

    if (indices.length === 1) {
      result[indices[0]] = total;
      continue;
    }

    const sumGross = indices.reduce(
      (sum, i) => sum + candidates[i].grossAmount,
      0,
    );
    for (const i of indices) {
      result[i] =
        sumGross === 0 ? 0 : total * (candidates[i].grossAmount / sumGross);
    }
  }

  return result;
}
