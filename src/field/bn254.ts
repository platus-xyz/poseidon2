/**
 * BN254 scalar field arithmetic.
 *
 * The field modulus is the order of the BN254 (alt_bn128) scalar field
 *
 * All operations return values in [0, p-1].
 */

export const BN254_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export class F1Field {
  readonly prime: bigint;
  readonly zero: bigint = 0n;
  readonly one: bigint = 1n;

  constructor(prime: bigint) {
    this.prime = prime;
  }

  e(x: bigint | number | string): bigint {
    const v = typeof x === 'bigint' ? x : BigInt(x);
    const r = v % this.prime;
    return r < 0n ? r + this.prime : r;
  }

  add(x: bigint, y: bigint): bigint {
    return (x + y) % this.prime;
  }

  sub(x: bigint, y: bigint): bigint {
    return (this.prime + x - y) % this.prime;
  }

  mul(x: bigint, y: bigint): bigint {
    return (x * y) % this.prime;
  }

  square(x: bigint): bigint {
    return (x * x) % this.prime;
  }

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

  inv(x: bigint): bigint {
    if (x === 0n) {
      throw new Error('Cannot invert zero');
    }
    return this.exp(x, this.prime - 2n);
  }

  neg(x: bigint): bigint {
    return x === 0n ? 0n : this.prime - x;
  }

  isValid(x: bigint): boolean {
    return x >= 0n && x < this.prime;
  }
}

export const bn254Field = new F1Field(BN254_MODULUS);
