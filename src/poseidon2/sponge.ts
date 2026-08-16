/**
 * Sponge construction over Poseidon2 permutation.
 *
 * Implements the standard field sponge with:
 *   - rate = t - 1 = 3 (number of field elements absorbed/squeezed per permutation)
 *   - capacity = 1 (last state element, holds domain separation IV)
 *   - Domain separation via IV = (inputLen << 64) + (outLen - 1)
 *
 * Supports both fixed-length and variable-length hashing modes.
 * Variable-length mode appends a 1n padding element after the input.
 */

import { bn254Field, type F1Field } from '../field/bn254';
import { poseidon2PermutationInPlace, T } from './permutation';

const RATE = T - 1; // 3

const enum Mode {
  ABSORB = 0,
  SQUEEZE = 1,
}

export class FieldSponge {
  private state: bigint[];
  private cache: bigint[];
  private cacheSize: number;
  /** Read pointer into cache during squeeze mode. */
  private cacheIdx: number;
  private mode: Mode;
  private readonly F: F1Field;

  constructor(domainIv: bigint = 0n, F: F1Field = bn254Field) {
    this.F = F;
    this.state = [0n, 0n, 0n, 0n];
    this.state[RATE] = domainIv;
    this.cache = [0n, 0n, 0n];
    this.cacheSize = 0;
    this.cacheIdx = 0;
    this.mode = Mode.ABSORB;
  }

  private performDuplex(): void {
    // The permutation starts with a modular linear layer. BigInt addition
    // cannot overflow, so reducing these lane sums here would be redundant.
    this.state[0] = this.state[0]! + (this.cacheSize > 0 ? this.cache[0]! : 0n);
    this.state[1] = this.state[1]! + (this.cacheSize > 1 ? this.cache[1]! : 0n);
    this.state[2] = this.state[2]! + (this.cacheSize > 2 ? this.cache[2]! : 0n);
    poseidon2PermutationInPlace(this.state, this.F);
  }

  /** Absorb a single field element into the sponge. */
  absorb(input: bigint): void {
    if (this.mode === Mode.ABSORB && this.cacheSize === RATE) {
      // Cache full — flush via permutation, then start fresh
      this.performDuplex();
      this.cache[0] = input;
      this.cacheSize = 1;
    } else if (this.mode === Mode.ABSORB) {
      this.cache[this.cacheSize] = input;
      this.cacheSize += 1;
    } else {
      // SQUEEZE → ABSORB transition: discard squeezed state, restart absorb
      this.cache[0] = input;
      this.cacheSize = 1;
      this.cacheIdx = 0;
      this.mode = Mode.ABSORB;
    }
  }

  /** Squeeze a single field element from the sponge. */
  squeeze(): bigint {
    if (this.mode === Mode.ABSORB) {
      // First squeeze after absorbing: flush remaining input and permute
      this.performDuplex();
      this.mode = Mode.SQUEEZE;
      for (let i = 0; i < RATE; i++) {
        this.cache[i] = this.state[i]!;
      }
      this.cacheSize = RATE;
      this.cacheIdx = 0;
    } else if (this.cacheIdx === this.cacheSize) {
      // SQUEEZE mode, cache exhausted: permute again without absorbing
      this.cacheSize = 0;
      this.performDuplex();
      for (let i = 0; i < RATE; i++) {
        this.cache[i] = this.state[i]!;
      }
      this.cacheSize = RATE;
      this.cacheIdx = 0;
    }

    return this.cache[this.cacheIdx++]!;
  }

  /**
   * Hash an array of field elements with configurable output length and mode.
   */
  static hashInternal(input: bigint[], outLen: number, isVariableLength: boolean): bigint[] {
    const iv = (BigInt(input.length) << 64n) + BigInt(outLen - 1);
    const state = [0n, 0n, 0n, iv];
    const inputLength = input.length;
    const absorbLength = inputLength + (isVariableLength ? 1 : 0);
    let offset = 0;

    // Direct block absorption avoids constructing a sponge object and two
    // cache arrays for the one-shot hash API. The do/while retains the empty
    // input permutation required by the fixed-length construction.
    do {
      const c0 =
        offset < inputLength
          ? input[offset]!
          : isVariableLength && offset === inputLength
            ? 1n
            : 0n;
      const c1 =
        offset + 1 < inputLength
          ? input[offset + 1]!
          : isVariableLength && offset + 1 === inputLength
            ? 1n
            : 0n;
      const c2 =
        offset + 2 < inputLength
          ? input[offset + 2]!
          : isVariableLength && offset + 2 === inputLength
            ? 1n
            : 0n;

      state[0] = state[0]! + c0;
      state[1] = state[1]! + c1;
      state[2] = state[2]! + c2;
      poseidon2PermutationInPlace(state, bn254Field);
      offset += RATE;
    } while (offset < absorbLength);

    const output: bigint[] = [];
    let lane = 0;
    for (let i = 0; i < outLen; i++) {
      if (lane === RATE) {
        poseidon2PermutationInPlace(state, bn254Field);
        lane = 0;
      }
      output.push(state[lane++]!);
    }
    return output;
  }

  /** Allocation-minimal specialization for the common binary compression. */
  static compress(left: bigint, right: bigint): bigint {
    const state = [left, right, 0n, 2n << 64n];
    poseidon2PermutationInPlace(state, bn254Field);
    return state[0]!;
  }

  /**
   * Async version of hashInternal that yields to the event loop between
   * each rate-sized absorb block. This prevents blocking the main thread
   * for large inputs — each permutation (every RATE elements) is separated
   * by a scheduler yield so other tasks can run between them.
   *
   * Only use for inputs larger than a handful of elements; for small inputs
   * the Promise overhead exceeds the computation time.
   */
  static async hashInternalAsync(
    input: bigint[],
    outLen: number,
    isVariableLength: boolean,
  ): Promise<bigint[]> {
    const iv = (BigInt(input.length) << 64n) + BigInt(outLen - 1);
    const sponge = new FieldSponge(iv);

    for (let i = 0; i < input.length; i++) {
      sponge.absorb(input[i]!);
      // Yield after filling each rate-sized block. The permutation fires on the
      // next absorb (when cacheSize wraps), so we yield just before it — giving
      // the event loop a window between every permutation for large inputs.
      if ((i + 1) % RATE === 0 && i + 1 < input.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    if (isVariableLength) {
      sponge.absorb(1n);
    }

    const output: bigint[] = [];
    for (let i = 0; i < outLen; i++) {
      output.push(sponge.squeeze());
    }
    return output;
  }

  /** Hash with fixed-length domain separation (input length is part of IV). */
  static hashFixedLength(input: bigint[], outLen: number = 1): bigint[] {
    return this.hashInternal(input, outLen, false);
  }

  /** Hash with variable-length domain separation (appends padding). */
  static hashVariableLength(input: bigint[], outLen: number = 1): bigint[] {
    return this.hashInternal(input, outLen, true);
  }
}
