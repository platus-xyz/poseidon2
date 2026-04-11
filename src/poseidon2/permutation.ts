/**
 * Poseidon2 permutation for BN254 with t=4, d=5, rounds_f=8, rounds_p=56.
 *
 * The permutation follows the Poseidon2 paper:
 *   1. Initial external matrix multiplication
 *   2. First half of full rounds (4 rounds): AddRC -> S-box -> External MDS
 *   3. Partial rounds (56 rounds): AddRC[0] -> S-box on state[0] only -> Internal MDS
 *   4. Second half of full rounds (4 rounds): AddRC -> S-box -> External MDS
 */

import type { F1Field } from '../field/bn254';
import { MAT_DIAG4_M_1, RC4 } from '../constants/roundConstants';

const T = 4;
const ROUNDS_F = 8;
const ROUNDS_F_HALF = 4;
const ROUNDS_P = 56;
const TOTAL_ROUNDS = ROUNDS_F + ROUNDS_P; // 64

const D0 = MAT_DIAG4_M_1[0]!;
const D1 = MAT_DIAG4_M_1[1]!;
const D2 = MAT_DIAG4_M_1[2]!;
const D3 = MAT_DIAG4_M_1[3]!;

const PARTIAL_RC: readonly bigint[] = RC4.slice(ROUNDS_F_HALF, ROUNDS_F_HALF + ROUNDS_P).map(
  (row) => row[0]!,
);

function sboxP(x: bigint, p: bigint): bigint {
  const x2 = (x * x) % p;
  const x4 = (x2 * x2) % p;
  return (x4 * x) % p;
}

/**
 * Execute the full Poseidon2 permutation on a 4-element state.
 *
 * matmulExternal and matmulInternal are inlined at every call site using shared
 * temp variables (t0–t5, sum). This eliminates one array allocation per call
 * site — 9 for external (1 initial + 4 first-half + 4 second-half) and 56 for
 * internal, totalling 65 fewer allocations per permutation.
 *
 * @param input - Array of exactly 4 field elements
 * @param F - Field instance (used only for prime access)
 * @returns New array with the permuted state
 * @throws If input length !== 4
 */
export function poseidon2Permutation(input: bigint[], F: F1Field): bigint[] {
  if (input.length !== T) {
    throw new Error(`Poseidon2 permutation expects ${T} elements, got ${input.length}`);
  }

  const p = F.prime;
  let s0 = input[0]!;
  let s1 = input[1]!;
  let s2 = input[2]!;
  let s3 = input[3]!;

  // Shared temporaries for inlined matmulExternal (reused across 9 sites)
  // and sum for inlined matmulInternal (reused across 56 sites).
  // Safe because JS is single-threaded and poseidon2Permutation is synchronous.
  let t0: bigint;
  let t1: bigint;
  let t2: bigint;
  let t3: bigint;
  let t4: bigint;
  let t5: bigint;
  let sum: bigint;
  let rc: bigint[];

  // matmulExternal inlined: M4 = [[5,7,1,3],[4,6,1,1],[1,3,5,7],[1,1,4,6]]
  t0 = (s0 + s1) % p;
  t1 = (s2 + s3) % p;
  t2 = (s1 + s1) % p;
  t2 = (t2 + t1) % p;
  t3 = (s3 + s3) % p;
  t3 = (t3 + t0) % p;
  t4 = (t1 + t1) % p;
  t4 = (t4 + t4) % p;
  t4 = (t4 + t3) % p;
  t5 = (t0 + t0) % p;
  t5 = (t5 + t5) % p;
  t5 = (t5 + t2) % p;
  s0 = (t3 + t5) % p;
  s1 = t5;
  s2 = (t2 + t4) % p;
  s3 = t4;

  for (let r = 0; r < ROUNDS_F_HALF; r++) {
    rc = RC4[r]!;
    s0 = (s0 + rc[0]!) % p;
    s1 = (s1 + rc[1]!) % p;
    s2 = (s2 + rc[2]!) % p;
    s3 = (s3 + rc[3]!) % p;

    s0 = sboxP(s0, p);
    s1 = sboxP(s1, p);
    s2 = sboxP(s2, p);
    s3 = sboxP(s3, p);

    t0 = (s0 + s1) % p;
    t1 = (s2 + s3) % p;
    t2 = (s1 + s1) % p;
    t2 = (t2 + t1) % p;
    t3 = (s3 + s3) % p;
    t3 = (t3 + t0) % p;
    t4 = (t1 + t1) % p;
    t4 = (t4 + t4) % p;
    t4 = (t4 + t3) % p;
    t5 = (t0 + t0) % p;
    t5 = (t5 + t5) % p;
    t5 = (t5 + t2) % p;
    s0 = (t3 + t5) % p;
    s1 = t5;
    s2 = (t2 + t4) % p;
    s3 = t4;
  }

  for (let r = 0; r < ROUNDS_P; r++) {
    s0 = (s0 + PARTIAL_RC[r]!) % p;
    s0 = sboxP(s0, p);

    sum = (((s0 + s1) % p) + ((s2 + s3) % p)) % p;
    s0 = ((D0 * s0) % p + sum) % p;
    s1 = ((D1 * s1) % p + sum) % p;
    s2 = ((D2 * s2) % p + sum) % p;
    s3 = ((D3 * s3) % p + sum) % p;
  }

  for (let r = 0; r < ROUNDS_F_HALF; r++) {
    rc = RC4[ROUNDS_F_HALF + ROUNDS_P + r]!;
    s0 = (s0 + rc[0]!) % p;
    s1 = (s1 + rc[1]!) % p;
    s2 = (s2 + rc[2]!) % p;
    s3 = (s3 + rc[3]!) % p;

    s0 = sboxP(s0, p);
    s1 = sboxP(s1, p);
    s2 = sboxP(s2, p);
    s3 = sboxP(s3, p);

    t0 = (s0 + s1) % p;
    t1 = (s2 + s3) % p;
    t2 = (s1 + s1) % p;
    t2 = (t2 + t1) % p;
    t3 = (s3 + s3) % p;
    t3 = (t3 + t0) % p;
    t4 = (t1 + t1) % p;
    t4 = (t4 + t4) % p;
    t4 = (t4 + t3) % p;
    t5 = (t0 + t0) % p;
    t5 = (t5 + t5) % p;
    t5 = (t5 + t2) % p;
    s0 = (t3 + t5) % p;
    s1 = t5;
    s2 = (t2 + t4) % p;
    s3 = t4;
  }

  return [s0, s1, s2, s3];
}

export { T, ROUNDS_F, ROUNDS_P, TOTAL_ROUNDS };
