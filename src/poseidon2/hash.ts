/**
 * High-level hash functions built on the Poseidon2 sponge.
 */

import { BN254_MODULUS } from '../field/bn254';
import { FieldSponge } from './sponge';

/**
 * Validate that all inputs are in the BN254 scalar field [0, p).
 * Throws a RangeError on the first out-of-range element.
 */
function assertFieldElements(inputs: bigint[]): void {
  for (let i = 0; i < inputs.length; i++) {
    const x = inputs[i]!;
    if (x < 0n || x >= BN254_MODULUS) {
      throw new RangeError(
        `Input at index ${i} (${x}) is not a valid BN254 field element (must be in [0, p))`,
      );
    }
  }
}

/**
 * Hash an array of BN254 field elements to a single field element.
 *
 * Uses the Poseidon2 sponge in fixed-length mode with domain separation
 * based on input length: IV = (inputLen << 64) | 0.
 *
 * Inputs are assumed to be valid field elements (0 ≤ x < p). Pass
 * `{ strict: true }` to throw immediately on any out-of-range input rather
 * than silently reducing it — this is recommended when inputs come from
 * untrusted sources or when strict circuit-compatibility is required.
 *
 * @param inputs - Array of field elements (bigint) to hash
 * @param options.strict - Throw on inputs outside [0, p) (default: false)
 * @returns A single BN254 field element
 *
 * @example
 * ```ts
 * import { poseidon2Hash } from '@platus-xyz/poseidon2';
 *
 * const commitment = poseidon2Hash([amount, secret, nullifier]);
 * // Strict mode — throws if any input >= p:
 * const h = poseidon2Hash([x, y], { strict: true });
 * ```
 */
export function poseidon2Hash(inputs: bigint[], options?: { strict?: boolean }): bigint {
  if (options?.strict) {
    assertFieldElements(inputs);
  }
  return FieldSponge.hashFixedLength(inputs)[0]!;
}

/**
 * Async version of poseidon2Hash that yields to the event loop between
 * each rate-sized block of absorbs.
 *
 * Unlike the previous implementation (which only deferred the start via
 * `setTimeout` but then blocked the thread for the full computation), this
 * version yields between every permutation boundary — keeping the main thread
 * responsive throughout large hash operations.
 *
 * For inputs of 3 elements or fewer (a single permutation), the synchronous
 * path is used to avoid Promise overhead.
 *
 * @param inputs - Array of field elements to hash
 * @param options.strict - Throw on inputs outside [0, p) (default: false)
 * @returns Promise resolving to a single BN254 field element
 */
export async function poseidon2HashAsync(
  inputs: bigint[],
  options?: { strict?: boolean },
): Promise<bigint> {
  if (options?.strict) {
    assertFieldElements(inputs);
  }
  // Fast path: 3 or fewer inputs → one permutation total, no benefit to yielding
  if (inputs.length <= 3) {
    return FieldSponge.hashFixedLength(inputs)[0]!;
  }
  const result = await FieldSponge.hashInternalAsync(inputs, 1, false);
  return result[0]!;
}

/**
 * Hash to multiple output field elements.
 *
 * @param inputs - Array of field elements to hash
 * @param outLen - Number of output elements (default: 1)
 * @param options.strict - Throw on inputs outside [0, p) (default: false)
 * @returns Array of BN254 field elements
 */
export function poseidon2HashMulti(
  inputs: bigint[],
  outLen: number = 1,
  options?: { strict?: boolean },
): bigint[] {
  if (options?.strict) {
    assertFieldElements(inputs);
  }
  return FieldSponge.hashFixedLength(inputs, outLen);
}

/**
 * Variable-length hash. Appends a 1n padding element after input to
 * distinguish inputs of different lengths that share the same sponge state.
 *
 * Use this when the input length is not fixed at compile time.
 *
 * @param inputs - Array of field elements to hash
 * @param options.strict - Throw on inputs outside [0, p) (default: false)
 * @returns A single BN254 field element
 */
export function poseidon2HashVarLen(inputs: bigint[], options?: { strict?: boolean }): bigint {
  if (options?.strict) {
    assertFieldElements(inputs);
  }
  return FieldSponge.hashVariableLength(inputs)[0]!;
}

/**
 * Two-input compression function. Equivalent to `poseidon2Hash([left, right])`
 * but with a cleaner API for the common Merkle tree and commitment use case.
 *
 * @param left - Left field element
 * @param right - Right field element
 * @returns A single BN254 field element
 *
 * @example
 * ```ts
 * // Merkle tree parent node:
 * const parent = poseidon2Compress(leftChild, rightChild);
 * ```
 */
export function poseidon2Compress(left: bigint, right: bigint): bigint {
  return FieldSponge.hashFixedLength([left, right])[0]!;
}
