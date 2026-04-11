/**
 * Poseidon2 benchmark script.
 *
 */

import { poseidon2Hash, poseidon2Permutation, bn254Field } from './index';

function bench(name: string, fn: () => void, iterations: number): void {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const elapsed = performance.now() - start;

  const opsPerSec = (iterations / elapsed) * 1000;
  const usPerOp = (elapsed / iterations) * 1000;

  console.log(
    `${name.padEnd(35)} ${opsPerSec.toFixed(0).padStart(8)} ops/sec  ${usPerOp.toFixed(1).padStart(8)} µs/op  (${iterations} iterations, ${elapsed.toFixed(0)}ms)`,
  );
}

console.log('='.repeat(90));
console.log('Poseidon2 BN254 Benchmark');
console.log('='.repeat(90));
console.log('');

// Permutation benchmark
bench(
  'permutation [0,1,2,3]',
  () => poseidon2Permutation([0n, 1n, 2n, 3n], bn254Field),
  5000,
);

// Hash benchmarks at various input sizes
for (const size of [1, 2, 3, 4, 8, 16, 32]) {
  const input = Array.from({ length: size }, (_, i) => BigInt(i));
  bench(`hash (${size} inputs)`, () => poseidon2Hash(input), 3000);
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

console.log('');
console.log('='.repeat(90));
