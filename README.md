# @platus-xyz/poseidon2

A high-performance, pure TypeScript implementation of the **Poseidon2** hash function over the **BN254 scalar field**, optimized for zero-knowledge proof systems.

It is a modern algebraic hash function designed specifically for ZK systems like SNARKs, STARKs, Plonk, and Halo2. Unlike SHA-256 or Keccak, it operates directly over finite fields, making it significantly more efficient inside arithmetic circuits.

---

## Why Poseidon2?

Poseidon2 improves on the original Poseidon design with fewer constraints and faster execution without sacrificing security.

| Property           | Poseidon   | Poseidon2                     |
| ------------------ | ---------- | ----------------------------- |
| External matrix    | Cauchy MDS | Optimized M4 (additions only) |
| Internal matrix    | Full MDS   | Diagonal + identity           |
| Constraint count   | Higher     | ~30% fewer                    |
| Native performance | Moderate   | Faster                        |
| Security margin    | Strong     | Strong (unchanged)            |

---

## Installation

```bash
# bun
bun add @platus-xyz/poseidon2

# pnpm
pnpm add @platus-xyz/poseidon2

# npm
npm install @platus-xyz/poseidon2
```

---

## Quick Start

```ts
import {
  poseidon2Hash,
  poseidon2Permutation,
  poseidon2HashAsync,
  bn254Field
} from '@platus-xyz/poseidon2';

// Basic hash
const hash = poseidon2Hash([0n, 1n, 2n]);

// Raw permutation (advanced usage)
const state = poseidon2Permutation([0n, 1n, 2n, 3n], bn254Field);

// Async hashing (non-blocking in browsers)
const result = await poseidon2HashAsync(largeArray);
```

---

## API

### Hashing

#### `poseidon2Hash(inputs: bigint[]): bigint`

Deterministic hash of fixed-length inputs.

#### `poseidon2HashAsync(inputs: bigint[]): Promise<bigint>`

Async version that avoids blocking the event loop.

#### `poseidon2HashVarLen(inputs: bigint[]): bigint`

Variable-length hash with domain separation.

#### `poseidon2HashMulti(inputs: bigint[], outLen: number): bigint[]`

Multi-output hash (sponge squeeze).

---

### Permutation

#### `poseidon2Permutation(state: bigint[], F: F1Field): bigint[]`

Low-level Poseidon2 permutation over a 4-element state.

Use this only if you're building custom constructions.

---

### Sponge API

#### `FieldSponge`

Fine-grained control over absorb/squeeze phases:

```ts
import { FieldSponge } from '@platus-xyz/poseidon2';

const sponge = new FieldSponge(domainIV);

sponge.absorb(value1);
sponge.absorb(value2);

const output = sponge.squeeze();
```

---

## Usage Patterns

### Merkle Tree

```ts
const parent = poseidon2Hash([left, right]);
```

---

## Parameters

| Parameter       | Value              |
| --------------- | ------------------ |
| Field           | BN254 scalar field |
| State width (t) | 4                  |
| S-box           | x⁵                 |
| Full rounds     | 8 (4 + 4)          |
| Partial rounds  | 56                 |
| Total rounds    | 64                 |
| Rate            | 3                  |
| Capacity        | 1                  |

---

## Security

### Design Guarantees

Poseidon2 is designed to resist:

* **Algebraic attacks** (e.g. Gröbner basis, interpolation)
* **Differential & linear cryptanalysis**
* **Statistical distinguishers**

The round structure (8 full + 56 partial) provides a conservative security margin.

---

### Constants

* Deterministically generated
* Compatible with common ZK ecosystems (Circom, Noir, etc.)
* No hidden randomness or backdoors

---

## Performance

Run benchmarks:

```bash
bun bench
```

### Example Results

| Operation         | Throughput      | Latency  |
| ----------------- | --------------- | -------- |
| Permutation (t=4) | ~14,160 ops/sec | 70.6 µs  |
| Hash (1 input)    | ~14,420 ops/sec | 69.3 µs  |
| Hash (2 inputs)   | ~16,500 ops/sec | 60.6 µs  |
| Hash (3 inputs)   | ~17,720 ops/sec | 56.4 µs  |
| Hash (4 inputs)   | ~8,860 ops/sec  | 112.9 µs |
| Hash (8 inputs)   | ~5,550 ops/sec  | 180.0 µs |
| Hash (16 inputs)  | ~2,410 ops/sec  | 414.7 µs |
| Hash (32 inputs)  | ~1,280 ops/sec  | 779.5 µs |

---

## License

MIT

---

## Contributing

Feel free to open a PR or discussion.
