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
import { poseidon2Permutation, T } from './permutation';

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
    for (let i = this.cacheSize; i < RATE; i++) {
      this.cache[i] = 0n;
    }
    for (let i = 0; i < RATE; i++) {
      this.state[i] = this.F.add(this.state[i]!, this.cache[i]!);
    }
    this.state = poseidon2Permutation(this.state, this.F);
  }

  /** Absorb a single field element into the sponge. */
  absorb(input: bigint): void {
    if (this.mode === Mode.ABSORB && this.cacheSize === RATE) {
      this.performDuplex();
      this.cache[0] = input;
      this.cacheSize = 1;
    } else if (this.mode === Mode.ABSORB) {
      this.cache[this.cacheSize] = input;
      this.cacheSize += 1;
    } else {
      this.cache[0] = input;
      this.cacheSize = 1;
      this.cacheIdx = 0;
      this.mode = Mode.ABSORB;
    }
  }

  /** Squeeze a single field element from the sponge. */
  squeeze(): bigint {
    if (this.mode === Mode.ABSORB) {
      this.performDuplex();
      this.mode = Mode.SQUEEZE;
      for (let i = 0; i < RATE; i++) {
        this.cache[i] = this.state[i]!;
      }
      this.cacheSize = RATE;
      this.cacheIdx = 0;
    } else if (this.cacheIdx === this.cacheSize) {
      for (let i = 0; i < RATE; i++) {
        this.cache[i] = 0n;
      }
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
    const sponge = new FieldSponge(iv);

    for (let i = 0; i < input.length; i++) {
      sponge.absorb(input[i]!);
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
