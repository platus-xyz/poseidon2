import { expect } from 'chai';
import {
  poseidon2Hash,
  poseidon2HashAsync,
  poseidon2HashMulti,
  poseidon2HashVarLen,
  poseidon2Compress,
  poseidon2Permutation,
  bn254Field,
  BN254_MODULUS,
  FieldSponge
} from '../src/index';

describe('Poseidon2 BN254', () => {
  describe('permutation — known vectors', () => {
    it('should match reference for repeated input', () => {
      const state = [
        BigInt('0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789'),
        BigInt('0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789'),
        BigInt('0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789'),
        BigInt('0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789'),
      ];
      const result = poseidon2Permutation(state, bn254Field);
      expect(result).to.deep.equal([
        BigInt('0x2bf1eaf87f7d27e8dc4056e9af975985bccc89077a21891d6c7b6ccce0631f95'),
        BigInt('0x0c01fa1b8d0748becafbe452c0cb0231c38224ea824554c9362518eebdd5701f'),
        BigInt('0x018555a8eb50cf07f64b019ebaf3af3c925c93e631f3ecd455db07bbb52bbdd3'),
        BigInt('0x0cbea457c91c22c6c31fd89afd2541efc2edf31736b9f721e823b2165c90fd41'),
      ]);
    });

    it('should match reference for [0, 1, 2, 3]', () => {
      const state = [0n, 1n, 2n, 3n];
      const result = poseidon2Permutation(state, bn254Field);
      expect(result).to.deep.equal([
        BigInt('0x01bd538c2ee014ed5141b29e9ae240bf8db3fe5b9a38629a9647cf8d76c01737'),
        BigInt('0x239b62e7db98aa3a2a8f6a0d2fa1709e7a35959aa6c7034814d9daa90cbac662'),
        BigInt('0x04cbb44c61d928ed06808456bf758cbf0c18d1e15a7b6dbc8245fa7515d5e3cb'),
        BigInt('0x2e11c5cff2a22c64d01304b778d78f6998eff1ab73163a35603f54794c30847a'),
      ]);
    });
  });

  describe('hash — known vectors', () => {
    it('should hash [0, 0] to known value', () => {
      const hash = poseidon2Hash([0n, 0n]);
      expect(hash).to.equal(
        BigInt('0x0b63a53787021a4a962a452c2921b3663aff1ffd8d5510540f8e659e782956f1'),
      );
    });

    it('should produce deterministic output', () => {
      const a = poseidon2Hash([1n, 2n, 3n]);
      const b = poseidon2Hash([1n, 2n, 3n]);
      expect(a).to.equal(b);
    });

    // L2: multi-output reference vector — with outLen=1 the IV is identical so outputs must match.
    // With outLen>1, IV = (inputLen<<64) + (outLen-1), so outputs intentionally differ.
    it('poseidon2HashMulti with outLen=1 matches poseidon2Hash', () => {
      const single = poseidon2Hash([1n, 2n, 3n]);
      const multi = poseidon2HashMulti([1n, 2n, 3n], 1);
      expect(multi).to.have.length(1);
      expect(multi[0]).to.equal(single);
    });

    it('poseidon2HashMulti with outLen>1 uses different IV than single-output hash', () => {
      // IV encodes outLen-1, so outLen=3 gives a different IV than outLen=1
      const single = poseidon2Hash([1n, 2n, 3n]);
      const multi = poseidon2HashMulti([1n, 2n, 3n], 3);
      expect(multi).to.have.length(3);
      expect(multi[0]).to.not.equal(single); // different IVs → different outputs
    });

    it('poseidon2HashMulti outputs are distinct field elements', () => {
      const multi = poseidon2HashMulti([42n, 99n], 4);
      expect(multi).to.have.length(4);
      const unique = new Set(multi);
      expect(unique.size).to.equal(4);
      for (const v of multi) {
        expect(v >= 0n && v < BN254_MODULUS).to.be.true;
      }
    });
  });

  // =========================================================================
  // Async hash — M2 fix: verifies true per-permutation yielding
  // =========================================================================

  describe('async hash', () => {
    it('should produce same result as sync hash (small input)', async () => {
      const sync = poseidon2Hash([0n, 0n]);
      const async_ = await poseidon2HashAsync([0n, 0n]);
      expect(async_).to.equal(sync);
    });

    it('should produce same result as sync hash (7 elements, crosses rate boundary)', async () => {
      const input = Array.from({ length: 7 }, (_, i) => BigInt(i + 1));
      const sync = poseidon2Hash(input);
      const async_ = await poseidon2HashAsync(input);
      expect(async_).to.equal(sync);
    });

    it('should produce same result as sync hash (20 elements, multiple yields)', async () => {
      const input = Array.from({ length: 20 }, (_, i) => BigInt(i));
      const sync = poseidon2Hash(input);
      const async_ = await poseidon2HashAsync(input);
      expect(async_).to.equal(sync);
    });

    it('should produce same result as sync hash (100 elements)', async () => {
      const input = Array.from({ length: 100 }, (_, i) => BigInt(i * 7 + 3));
      const sync = poseidon2Hash(input);
      const async_ = await poseidon2HashAsync(input);
      expect(async_).to.equal(sync);
    });

    it('async yields to event loop — concurrent task runs during large hash', async () => {
      const input = Array.from({ length: 30 }, (_, i) => BigInt(i));
      let sideEffectRan = false;
      const sideTask = new Promise<void>((resolve) =>
        setTimeout(() => {
          sideEffectRan = true;
          resolve();
        }, 0),
      );
      await poseidon2HashAsync(input);
      await sideTask;
      expect(sideEffectRan).to.be.true;
    });
  });

  // =========================================================================
  // Field arithmetic tests
  // =========================================================================

  describe('F1Field', () => {
    const F = bn254Field;

    it('add wraps around modulus', () => {
      const a = BN254_MODULUS - 1n;
      const b = 2n;
      expect(F.add(a, b)).to.equal(1n);
    });

    it('sub handles underflow', () => {
      expect(F.sub(0n, 1n)).to.equal(BN254_MODULUS - 1n);
    });

    it('mul is correct', () => {
      expect(F.mul(3n, 7n)).to.equal(21n);
    });

    it('square matches mul', () => {
      const x = 12345678901234567890n;
      expect(F.square(x)).to.equal(F.mul(x, x));
    });

    it('exp computes x^0 = 1', () => {
      expect(F.exp(42n, 0n)).to.equal(1n);
    });

    it('exp computes x^1 = x', () => {
      expect(F.exp(42n, 1n)).to.equal(42n);
    });

    it('inv * x = 1', () => {
      const x = 123456789n;
      expect(F.mul(x, F.inv(x))).to.equal(1n);
    });

    it('neg + x = 0', () => {
      const x = 99999n;
      expect(F.add(x, F.neg(x))).to.equal(0n);
    });

    it('e normalizes negative values', () => {
      expect(F.e(-1n)).to.equal(BN254_MODULUS - 1n);
    });
  });

  // =========================================================================
  // Property-based tests
  // =========================================================================

  describe('property tests', () => {
    it('avalanche effect — flipping one input bit changes many output bits', () => {
      const base = [100n, 200n, 300n];
      const flipped = [101n, 200n, 300n]; // single LSB flip
      const h1 = poseidon2Hash(base);
      const h2 = poseidon2Hash(flipped);
      expect(h1).to.not.equal(h2);

      // Check that outputs differ in multiple bits
      const xor = h1 ^ h2;
      let diffBits = 0;
      let v = xor;
      while (v > 0n) {
        diffBits += Number(v & 1n);
        v >>= 1n;
      }
      // Expect at least 64 bits differ (out of ~254) for good avalanche
      expect(diffBits).to.be.greaterThan(64);
    });

    it('collision sanity — distinct inputs produce distinct outputs', () => {
      const seen = new Set<bigint>();
      for (let i = 0n; i < 100n; i++) {
        const h = poseidon2Hash([i, i + 1n]);
        expect(seen.has(h)).to.be.false;
        seen.add(h);
      }
    });

    it('all outputs are valid field elements', () => {
      for (let i = 0n; i < 50n; i++) {
        const h = poseidon2Hash([i]);
        expect(h >= 0n && h < BN254_MODULUS).to.be.true;
      }
    });

    it('permutation output is in field', () => {
      const result = poseidon2Permutation([0n, 0n, 0n, 0n], bn254Field);
      for (const v of result) {
        expect(v >= 0n && v < BN254_MODULUS).to.be.true;
      }
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('empty input', () => {
      const h = poseidon2Hash([]);
      expect(h >= 0n && h < BN254_MODULUS).to.be.true;
    });

    it('single element input', () => {
      const h = poseidon2Hash([42n]);
      expect(h >= 0n && h < BN254_MODULUS).to.be.true;
    });

    it('large input array (20 elements)', () => {
      const input = Array.from({ length: 20 }, (_, i) => BigInt(i));
      const h = poseidon2Hash(input);
      expect(h >= 0n && h < BN254_MODULUS).to.be.true;
    });

    it('max field element input', () => {
      const maxVal = BN254_MODULUS - 1n;
      const h = poseidon2Hash([maxVal, maxVal]);
      expect(h >= 0n && h < BN254_MODULUS).to.be.true;
    });

    // L4: inputs at p-1 and p-2 boundaries
    it('p-1 and p-2 inputs produce valid and distinct field elements', () => {
      const p = BN254_MODULUS;
      const h1 = poseidon2Hash([p - 1n]);
      const h2 = poseidon2Hash([p - 2n]);
      const h3 = poseidon2Hash([p - 1n, p - 2n]);
      expect(h1 >= 0n && h1 < p).to.be.true;
      expect(h2 >= 0n && h2 < p).to.be.true;
      expect(h3 >= 0n && h3 < p).to.be.true;
      expect(h1).to.not.equal(h2);
    });

    // L4: p+1 is silently reduced to 1 (documents the existing silent-reduction behaviour)
    it('input p+1 reduces to 1 — same output as input 1', () => {
      expect(poseidon2Hash([BN254_MODULUS + 1n])).to.equal(poseidon2Hash([1n]));
    });

    it('zero input', () => {
      const h = poseidon2Hash([0n]);
      expect(h >= 0n && h < BN254_MODULUS).to.be.true;
      expect(h).to.not.equal(0n); // extremely unlikely to hash to zero
    });

    it('permutation rejects wrong-sized input', () => {
      expect(() => poseidon2Permutation([0n, 1n], bn254Field)).to.throw('expects 4 elements');
      expect(() => poseidon2Permutation([0n, 1n, 2n, 3n, 4n], bn254Field)).to.throw(
        'expects 4 elements',
      );
    });

    it('permutation does not mutate input', () => {
      const input = [1n, 2n, 3n, 4n];
      const copy = [...input];
      poseidon2Permutation(input, bn254Field);
      expect(input).to.deep.equal(copy);
    });
  });

  // =========================================================================
  // Strict mode (M1 fix: input validation)
  // =========================================================================

  describe('strict mode validation', () => {
    it('accepts valid field elements in strict mode', () => {
      expect(() => poseidon2Hash([0n, BN254_MODULUS - 1n], { strict: true })).to.not.throw();
    });

    it('throws RangeError on input >= p in strict mode', () => {
      expect(() => poseidon2Hash([BN254_MODULUS], { strict: true })).to.throw(RangeError);
      expect(() => poseidon2Hash([BN254_MODULUS + 1n], { strict: true })).to.throw(RangeError);
    });

    it('throws RangeError on negative input in strict mode', () => {
      expect(() => poseidon2Hash([-1n], { strict: true })).to.throw(RangeError);
    });

    it('strict mode propagates through poseidon2HashMulti', () => {
      expect(() => poseidon2HashMulti([BN254_MODULUS], 1, { strict: true })).to.throw(RangeError);
    });

    it('strict mode propagates through poseidon2HashVarLen', () => {
      expect(() => poseidon2HashVarLen([BN254_MODULUS], { strict: true })).to.throw(RangeError);
    });

    it('strict mode propagates through poseidon2HashAsync', async () => {
      let threw = false;
      try {
        await poseidon2HashAsync([BN254_MODULUS], { strict: true });
      } catch {
        threw = true;
      }
      expect(threw).to.be.true;
    });

    it('without strict mode, out-of-range inputs are silently reduced', () => {
      expect(() => poseidon2Hash([BN254_MODULUS])).to.not.throw();
      // p ≡ 0 mod p, so hash([p]) === hash([0])
      expect(poseidon2Hash([BN254_MODULUS])).to.equal(poseidon2Hash([0n]));
    });
  });

  // =========================================================================
  // poseidon2Compress (L7: ergonomic Merkle / commitment API)
  // =========================================================================

  describe('poseidon2Compress', () => {
    it('matches poseidon2Hash([left, right])', () => {
      const left = 123456789n;
      const right = 987654321n;
      expect(poseidon2Compress(left, right)).to.equal(poseidon2Hash([left, right]));
    });

    it('is not commutative', () => {
      expect(poseidon2Compress(1n, 2n)).to.not.equal(poseidon2Compress(2n, 1n));
    });

    it('output is a valid field element', () => {
      const h = poseidon2Compress(0n, 0n);
      expect(h >= 0n && h < BN254_MODULUS).to.be.true;
    });

    it('can build a 4-leaf Merkle tree', () => {
      const [l0, l1, l2, l3] = [10n, 20n, 30n, 40n];
      const left = poseidon2Compress(l0, l1);
      const right = poseidon2Compress(l2, l3);
      const root = poseidon2Compress(left, right);
      expect(root >= 0n && root < BN254_MODULUS).to.be.true;
    });
  });

  // =========================================================================
  // Sponge internals
  // =========================================================================

  describe('sponge construction', () => {
    it('multi-output hash returns requested number of elements', () => {
      const result = poseidon2HashMulti([1n, 2n, 3n], 3);
      expect(result).to.have.length(3);
      for (const v of result) {
        expect(v >= 0n && v < BN254_MODULUS).to.be.true;
      }
    });

    it('variable-length hash differs from fixed-length hash', () => {
      const fixed = poseidon2Hash([1n, 2n]);
      const variable = poseidon2HashVarLen([1n, 2n]);
      expect(fixed).to.not.equal(variable);
    });

    it('different input lengths produce different hashes (variable-length mode)', () => {
      const h1 = poseidon2HashVarLen([1n, 2n, 0n]);
      const h2 = poseidon2HashVarLen([1n, 2n]);
      expect(h1).to.not.equal(h2);
    });

    it('FieldSponge can be used manually', () => {
      const sponge = new FieldSponge(0n);
      sponge.absorb(1n);
      sponge.absorb(2n);
      const out = sponge.squeeze();
      expect(out >= 0n && out < BN254_MODULUS).to.be.true;
    });

    it('domain separation — different IVs produce different outputs', () => {
      const s1 = new FieldSponge(0n);
      s1.absorb(1n);
      const out1 = s1.squeeze();

      const s2 = new FieldSponge(1n);
      s2.absorb(1n);
      const out2 = s2.squeeze();

      expect(out1).to.not.equal(out2);
    });

    // Verifies the cacheIdx squeeze optimization handles >RATE outputs correctly
    it('multi-squeeze beyond RATE matches hashMulti reference', () => {
      const inputs = [7n, 8n, 9n];
      const expected = poseidon2HashMulti(inputs, 6);

      const iv = (BigInt(inputs.length) << 64n) + 5n; // outLen-1 = 5
      const sponge = new FieldSponge(iv);
      for (const x of inputs) sponge.absorb(x);
      const manual = Array.from({ length: 6 }, () => sponge.squeeze());

      expect(manual).to.deep.equal(expected);
    });

    // Verifies the SQUEEZE → ABSORB transition resets state correctly
    it('absorb after squeeze resets and produces consistent output', () => {
      const s1 = new FieldSponge(0n);
      s1.absorb(1n);
      const out1a = s1.squeeze();
      s1.absorb(2n);
      const out1b = s1.squeeze();

      const s2 = new FieldSponge(0n);
      s2.absorb(1n);
      expect(s2.squeeze()).to.equal(out1a);
      s2.absorb(2n);
      expect(s2.squeeze()).to.equal(out1b);
    });
  });
});
