/**
 * Poseidon2 benchmark script.
 *
 * Usage: bun run src/benchmark.ts
 * Or: pnpm bench
 */

import { bn254Field, poseidon2Compress, poseidon2Hash, poseidon2Permutation } from './index';

let sink = 0n;

function bench(name: string, fn: () => bigint, iterations: number, samples: number = 7): void {
  // Warm before collecting samples.
  for (let i = 0; i < Math.max(500, iterations); i++) {
    sink ^= fn();
  }

  const timings: number[] = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      sink ^= fn();
    }
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);

  const elapsed = timings[Math.floor(timings.length / 2)]!;
  const opsPerSec = (iterations * 1000) / elapsed;
  const usPerOp = (elapsed * 1000) / iterations;

  console.log(
    `${name.padEnd(35)} ${opsPerSec.toFixed(0).padStart(8)} ops/sec  ${usPerOp.toFixed(1).padStart(8)} µs/op  (median of ${samples})`,
  );
}

console.log('='.repeat(90));
console.log('Poseidon2 BN254 Benchmark');
console.log('='.repeat(90));
console.log('');

// Permutation benchmark
bench('permutation [0,1,2,3]', () => poseidon2Permutation([0n, 1n, 2n, 3n], bn254Field)[0]!, 2000);

bench('compress (2 inputs)', () => poseidon2Compress(123n, 456n), 2000);

// Hash benchmarks at various input sizes
for (const size of [1, 2, 3, 4, 8, 16, 32]) {
  const input = Array.from({ length: size }, (_, i) => BigInt(i));
  const iterations = size <= 3 ? 2000 : size <= 8 ? 1000 : size <= 16 ? 500 : 250;
  bench(`hash (${size} inputs)`, () => poseidon2Hash(input), iterations);
}

// Merkle tree simulation (binary tree, 1024 leaves)
console.log('');
const leaves = Array.from({ length: 1024 }, (_, i) => BigInt(i));
const merkleStart = performance.now();
let currentLevel = leaves;
while (currentLevel.length > 1) {
  const nextLevel: bigint[] = [];
  for (let i = 0; i < currentLevel.length; i += 2) {
    nextLevel.push(poseidon2Hash([currentLevel[i]!, currentLevel[i + 1] ?? 0n]));
  }
  currentLevel = nextLevel;
}
const merkleElapsed = performance.now() - merkleStart;
console.log(
  `Merkle tree (1024 leaves, 1023 hashes): ${merkleElapsed.toFixed(0)}ms (${((1023 / merkleElapsed) * 1000).toFixed(0)} hashes/sec)`,
);

// Prevent an optimizing runtime from treating benchmark results as unused.
if (sink === -1n) console.log('unreachable');

console.log('');
console.log('='.repeat(90));
