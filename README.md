# Poseidon2 Hash for BN254

`@platus-xyz/poseidon2` is the fastest and pure TypeScript, zero-dependency implementation of [Poseidon2](https://eprint.iacr.org/2023/323) over the BN254 scalar field.

It provides field-native hashing for ZK applications, Merkle trees, commitments, nullifiers, and other cryptographic constructions.

## Features

* `bigint` field elements with ESM support
* Fixed-length and variable-length hashing
* Two-input compression for Merkle trees and commitments
* Multiple outputs from a single sponge
* Async hashing for large inputs
* Low-level permutation and sponge APIs
* BN254 field utilities and constants
* No runtime dependencies

## Parameters

| Parameter       | Value              |
| --------------- | ------------------ |
| Field           | BN254 scalar field |
| State width     | `t = 4`            |
| Rate / capacity | `3 / 1`            |
| S-box           | `x^5`              |
| Full rounds     | `8` (`4 + 4`)      |
| Partial rounds  | `56`               |
| Total rounds    | `64`               |
| License         | MIT                |

The field modulus is:

```text
21888242871839275222246405745257275088548364400416034343698204186575808495617
```

## Installation

```bash
npm install @platus-xyz/poseidon2
# or
pnpm add @platus-xyz/poseidon2
# or
bun add @platus-xyz/poseidon2
```

## Quick start

```ts
import {
  poseidon2Hash,
  poseidon2Compress,
} from '@platus-xyz/poseidon2';

const digest = poseidon2Hash([100n, 7n, 42n]);
const parent = poseidon2Compress(leftChild, rightChild);
```

All inputs are `bigint`. Hash outputs are canonical field elements in `[0, p)`.

## API

```ts
poseidon2Hash(
  inputs: bigint[],
  options?: { strict?: boolean },
): bigint;

poseidon2HashVarLen(
  inputs: bigint[],
  options?: { strict?: boolean },
): bigint;

poseidon2HashMulti(
  inputs: bigint[],
  outLen?: number,
  options?: { strict?: boolean },
): bigint[];

poseidon2HashAsync(
  inputs: bigint[],
  options?: { strict?: boolean },
): Promise<bigint>;

poseidon2Compress(left: bigint, right: bigint): bigint;
```

### Hash modes

| API                   | Construction            | Use                                 |
| --------------------- | ----------------------- | ----------------------------------- |
| `poseidon2Hash`       | Fixed-length sponge     | Protocols with defined input length |
| `poseidon2HashVarLen` | `1n` marker after input | Runtime-variable input lengths      |
| `poseidon2HashMulti`  | Fixed-length sponge     | Multiple outputs                    |
| `poseidon2Compress`   | Optimized 2-input hash  | Merkle parents and commitments      |

Fixed-length hashing uses:

```text
IV = (inputLength << 64) + (outLen - 1)
```

`poseidon2HashMulti` includes `outLen` in the domain separation. `poseidon2Compress(a, b)` is the optimized equivalent of `poseidon2Hash([a, b])`.

Variable-length hashing uses an explicit `1n` marker. **Do not mix these constructions when interoperating with another implementation.**

### Strict field validation

By default, inputs are reduced modulo the BN254 modulus:

```ts
poseidon2Hash([BN254_MODULUS + 1n]) === poseidon2Hash([1n]);
```

Use strict mode when inputs must already be canonical:

```ts
poseidon2Hash([BN254_MODULUS], { strict: true });
// RangeError
```

`strict` is supported by `poseidon2Hash`, `poseidon2HashVarLen`, `poseidon2HashMulti`, and `poseidon2HashAsync`.

## Multiple outputs

```ts
import { poseidon2HashMulti } from '@platus-xyz/poseidon2';

const outputs = poseidon2HashMulti([1n, 2n, 3n], 4);
// bigint[] — four field elements
```

## Async hashing

`poseidon2HashAsync` returns the same digest as `poseidon2Hash` while yielding between absorb blocks for larger inputs:

```ts
const input = Array.from(
  { length: 10_000 },
  (_, i) => BigInt(i),
);

const digest = await poseidon2HashAsync(input);
```

It is intended for responsiveness, not higher throughput or parallel execution.

## Low-level API

### Permutation

`poseidon2Permutation` applies the 64-round permutation to a four-element state:

```ts
import {
  bn254Field,
  poseidon2Permutation,
} from '@platus-xyz/poseidon2';

const state = poseidon2Permutation(
  [0n, 1n, 2n, 3n],
  bn254Field,
);
```

Use `bn254Field` with the bundled BN254 Poseidon2 constants for interoperability.

### Custom sponge

```ts
import { FieldSponge } from '@platus-xyz/poseidon2';

const sponge = new FieldSponge(0n);

sponge.absorb(10n);
sponge.absorb(20n);

const first = sponge.squeeze();
const second = sponge.squeeze();
```

When using `FieldSponge` directly, you define the IV, padding, and absorb/squeeze schedule.

### Constants and utilities

The package also exports:

* `BN254_MODULUS`
* `bn254Field`
* `F1Field`
* `T`
* `ROUNDS_F`
* `ROUNDS_P`
* `TOTAL_ROUNDS`
* `MAT_DIAG4_M_1`
* `RC4`

## Merkle trees

Use `poseidon2Compress` for ordered binary Merkle trees:

```ts
const parent = poseidon2Compress(left, right);
```

The function is **not commutative**, so child ordering matters. Your tree protocol should also define empty-node values and encoding rules.

## Interoperability

To reproduce a hash elsewhere, verify:

1. BN254 **scalar** field is used.
2. `t = 4` and S-box `x^5`.
3. `8` full and `56` partial rounds.
4. Identical round constants and linear layers.
5. Identical fixed/variable-length mode.
6. Identical IV, padding, input ordering, and domain separation.
7. Identical field-element normalization rules.

This package hashes field elements, not arbitrary bytes or strings. Define a canonical byte-to-field encoding before hashing byte-based data.

## Development

```bash
git clone https://github.com/platus-xyz/poseidon2.git
cd poseidon2
pnpm install

pnpm test
pnpm build
pnpm bench
```

`pnpm bench` runs the TypeScript benchmark with Bun.

Benchmark results vary by machine and runtime, so measure your target environment before capacity planning.

## Security

Poseidon2 is a cryptographic primitive, this package does not constitute a security audit of your protocol.

Before production use:

* Verify outputs against an independent implementation or circuit fixture.
* Specify encoding, ordering, padding, and domain separation.
* Use `{ strict: true }` at trust boundaries when canonical inputs are required.
* Review the complete protocol threat model.

## Contributing

Run `pnpm test` and `pnpm build` before submitting changes. For performance-sensitive changes, also run `pnpm bench` and include the impact in the PR.

## License

MIT