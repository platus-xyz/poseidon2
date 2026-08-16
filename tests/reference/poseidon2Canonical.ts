import { MAT_DIAG4_M_1, RC4 } from '../../src/constants/roundConstants';
import { BN254_MODULUS } from '../../src/field/bn254';

const RATE = 3;
const ROUNDS_F_HALF = 4;
const ROUNDS_P = 56;

function mod(value: bigint): bigint {
  const reduced = value % BN254_MODULUS;
  return reduced < 0n ? reduced + BN254_MODULUS : reduced;
}

function sbox(value: bigint): bigint {
  const square = mod(value * value);
  const fourth = mod(square * square);
  return mod(fourth * value);
}

/**
 * Deliberately straightforward Poseidon2 oracle.
 *
 * This uses the explicit external matrix and reduces every matrix output. It
 * intentionally does not share the optimized addition chain or deferred
 * reductions from production, so differential tests can catch errors in those
 * transformations.
 */
export function canonicalPoseidon2Permutation(input: readonly bigint[]): bigint[] {
  if (input.length !== 4) {
    throw new Error(`Poseidon2 permutation expects 4 elements, got ${input.length}`);
  }

  let state = input.map(mod);

  const externalLayer = (): void => {
    const [s0, s1, s2, s3] = state as [bigint, bigint, bigint, bigint];
    state = [
      mod(5n * s0 + 7n * s1 + s2 + 3n * s3),
      mod(4n * s0 + 6n * s1 + s2 + s3),
      mod(s0 + 3n * s1 + 5n * s2 + 7n * s3),
      mod(s0 + s1 + 4n * s2 + 6n * s3),
    ];
  };

  externalLayer();

  for (let round = 0; round < ROUNDS_F_HALF; round++) {
    const constants = RC4[round]!;
    for (let lane = 0; lane < 4; lane++) {
      state[lane] = sbox(state[lane]! + constants[lane]!);
    }
    externalLayer();
  }

  for (let round = 0; round < ROUNDS_P; round++) {
    state[0] = sbox(state[0]! + RC4[ROUNDS_F_HALF + round]![0]!);
    const sum = mod(state[0]! + state[1]! + state[2]! + state[3]!);
    for (let lane = 0; lane < 4; lane++) {
      state[lane] = mod(MAT_DIAG4_M_1[lane]! * state[lane]! + sum);
    }
  }

  for (let round = ROUNDS_F_HALF + ROUNDS_P; round < RC4.length; round++) {
    const constants = RC4[round]!;
    for (let lane = 0; lane < 4; lane++) {
      state[lane] = sbox(state[lane]! + constants[lane]!);
    }
    externalLayer();
  }

  return state;
}

export function canonicalPoseidon2Hash(
  input: readonly bigint[],
  outLen: number = 1,
  isVariableLength: boolean = false,
): bigint[] {
  if (outLen <= 0) return [];

  const absorbInput = isVariableLength ? [...input, 1n] : input;
  let state = [0n, 0n, 0n, (BigInt(input.length) << 64n) + BigInt(outLen - 1)];
  let offset = 0;

  do {
    state[0] = mod(state[0]! + (absorbInput[offset] ?? 0n));
    state[1] = mod(state[1]! + (absorbInput[offset + 1] ?? 0n));
    state[2] = mod(state[2]! + (absorbInput[offset + 2] ?? 0n));
    state = canonicalPoseidon2Permutation(state);
    offset += RATE;
  } while (offset < absorbInput.length);

  const output: bigint[] = [];
  while (output.length < outLen) {
    for (let lane = 0; lane < RATE && output.length < outLen; lane++) {
      output.push(state[lane]!);
    }
    if (output.length < outLen) {
      state = canonicalPoseidon2Permutation(state);
    }
  }
  return output;
}
