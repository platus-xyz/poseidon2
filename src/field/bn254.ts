/**
 * BN254 scalar field arithmetic.
 *
 * The field modulus is the order of the BN254 (alt_bn128) scalar field, used universally across Circom, Noir, Halo2, and Plonk-based systems.
 *
 * All operations return values in [0, p-1].
 */

/** BN254 scalar field prime: r = 21888242871839275222246405745257275088548364400416034343698204186575808495617 */
export const BN254_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export class F1Field {
  readonly prime: bigint;
  readonly zero: bigint = 0n;
  readonly one: bigint = 1n;

  constructor(prime: bigint) {
    this.prime = prime;
  }

  /** Convert to field element */
  e(x: bigint | number | string): bigint {
    const v = typeof x === 'bigint' ? x : BigInt(x);
    const r = v % this.prime;
    return r < 0n ? r + this.prime : r;
  }

  /** Modular addition */
  add(x: bigint, y: bigint): bigint {
    return (x + y) % this.prime;
  }

  /** Modular subtraction */
  sub(x: bigint, y: bigint): bigint {
    return (this.prime + x - y) % this.prime;
  }

  /** Modular multiplication */
  mul(x: bigint, y: bigint): bigint {
    return (x * y) % this.prime;
  }

  /** Modular squaring (faster than mul(x,x) — avoids one temporary) */
  square(x: bigint): bigint {
    return (x * x) % this.prime;
  }

  /** Modular exponentiation via square-and-multiply */
  exp(base: bigint, exponent: bigint): bigint {
    let result = 1n;
    let b = base % this.prime;
    let e = exponent;
    while (e > 0n) {
      if (e & 1n) {
        result = (result * b) % this.prime;
      }
      b = (b * b) % this.prime;
      e >>= 1n;
    }
    return result;
  }

  /** Modular inverse via Fermat's little theorem: x^(p-2) mod p */
  inv(x: bigint): bigint {
    if (x === 0n) {
      throw new Error('Cannot invert zero');
    }
    return this.exp(x, this.prime - 2n);
  }

  /** Modular negation */
  neg(x: bigint): bigint {
    return x === 0n ? 0n : this.prime - x;
  }

  /** Check if value is a valid field element */
  isValid(x: bigint): boolean {
    return x >= 0n && x < this.prime;
  }
}

/** Singleton BN254 field instance */
export const bn254Field = new F1Field(BN254_MODULUS);
