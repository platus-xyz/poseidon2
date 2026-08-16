import { expect } from 'chai';
import {
  BN254_MODULUS,
  bn254Field,
  poseidon2Compress,
  poseidon2Hash,
  poseidon2HashMulti,
  poseidon2HashVarLen,
  poseidon2Permutation,
  FieldSponge,
} from '../src/index';
import {
  canonicalPoseidon2Hash,
  canonicalPoseidon2Permutation,
} from './reference/poseidon2Canonical';

const MASK_64 = (1n << 64n) - 1n;
const MASK_256 = (1n << 256n) - 1n;

class SplitMix64 {
  private state: bigint;

  constructor(seed: bigint) {
    this.state = seed & MASK_64;
  }

  next64(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & MASK_64;
    let value = this.state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
    return (value ^ (value >> 31n)) & MASK_64;
  }

  next256(): bigint {
    return (
      (this.next64() << 192n) | (this.next64() << 128n) | (this.next64() << 64n) | this.next64()
    );
  }
}

function fuzzValue(rng: SplitMix64, caseIndex: number): bigint {
  switch (caseIndex % 10) {
    case 0:
      return 0n;
    case 1:
      return 1n;
    case 2:
      return BN254_MODULUS - 1n;
    case 3:
      return BN254_MODULUS;
    case 4:
      return BN254_MODULUS + 1n;
    case 5:
      return 2n * BN254_MODULUS - 1n;
    case 6:
      return MASK_256;
    case 7:
      return rng.next256();
    case 8:
      return -1n;
    default:
      return -rng.next256();
  }
}

describe('Poseidon2 differential fuzzing', function () {
  this.timeout(30_000);

  it('matches the canonical permutation for 10,000 deterministic states', () => {
    const rng = new SplitMix64(0x706f736569646f6en);
    for (let run = 0; run < 10_000; run++) {
      const input = Array.from({ length: 4 }, (_, lane) => fuzzValue(rng, run + lane));
      const actual = poseidon2Permutation(input, bn254Field);
      const expected = canonicalPoseidon2Permutation(input);
      expect(actual, `permutation mismatch at run ${run}`).to.deep.equal(expected);
      for (const value of actual) {
        const isCanonical = value >= 0n && value < BN254_MODULUS;
        expect(isCanonical, `non-canonical output at run ${run}`).to.be.true;
      }
    }
  });

  it('matches canonical two-input hashing for 10,000 deterministic pairs', () => {
    const rng = new SplitMix64(0x68617368322d667an);
    for (let run = 0; run < 10_000; run++) {
      const left = fuzzValue(rng, run);
      const right = fuzzValue(rng, run + 1);
      const expected = canonicalPoseidon2Hash([left, right])[0]!;
      expect(poseidon2Compress(left, right), `compress mismatch at run ${run}`).to.equal(expected);
      expect(poseidon2Hash([left, right]), `hash mismatch at run ${run}`).to.equal(expected);
    }
  });

  it('matches canonical fixed and variable sponges across 2,000 arrays', () => {
    const rng = new SplitMix64(0x73706f6e67652d667an);
    const boundaryLengths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 20, 31, 32, 33, 63, 64];

    for (let run = 0; run < 2_000; run++) {
      const length =
        run < boundaryLengths.length ? boundaryLengths[run]! : Number(rng.next64() % 65n);
      const input = Array.from({ length }, (_, index) => fuzzValue(rng, run + index));
      expect(poseidon2Hash(input), `fixed hash mismatch at run ${run}`).to.equal(
        canonicalPoseidon2Hash(input)[0],
      );
      expect(poseidon2HashVarLen(input), `variable hash mismatch at run ${run}`).to.equal(
        canonicalPoseidon2Hash(input, 1, true)[0],
      );
    }
  });

  it('matches canonical multi-output squeezing across 1,000 cases', () => {
    const rng = new SplitMix64(0x73717565657a652dn);
    for (let run = 0; run < 1_000; run++) {
      const length = Number(rng.next64() % 21n);
      const outLen = Number((rng.next64() % 8n) + 1n);
      const input = Array.from({ length }, (_, index) => fuzzValue(rng, run + index));
      expect(
        poseidon2HashMulti(input, outLen),
        `multi-output mismatch at run ${run}`,
      ).to.deep.equal(canonicalPoseidon2Hash(input, outLen));
    }
  });

  it('matches canonical manual sponge use across 500 absorb/squeeze cases', () => {
    const rng = new SplitMix64(0x6d616e75616c2d667an);
    for (let run = 0; run < 500; run++) {
      const length = Number(rng.next64() % 34n);
      const outLen = Number((rng.next64() % 6n) + 1n);
      const input = Array.from({ length }, (_, index) => fuzzValue(rng, run + index));
      const iv = (BigInt(length) << 64n) + BigInt(outLen - 1);
      const sponge = new FieldSponge(iv);
      for (const value of input) sponge.absorb(value);
      const actual = Array.from({ length: outLen }, () => sponge.squeeze());
      expect(actual, `manual sponge mismatch at run ${run}`).to.deep.equal(
        canonicalPoseidon2Hash(input, outLen),
      );
    }
  });
});
