/**
 * MDS (Maximum Distance Separable) matrix constants for Poseidon2 BN254 t=4.
 *
 * Poseidon2 uses two distinct linear layers:
 *   - External (full rounds): M4 circulant-derived matrix applied in 4x4 blocks
 *   - Internal (partial rounds): diagonal matrix + all-ones matrix (M_I = diag + 1)
 *
 * The external matrix is hardcoded as an optimized sequence of additions
 * (no explicit matrix needed). The internal matrix uses MAT_DIAG4_M_1 from
 * roundConstants.ts via the formula: state[i] = diag[i] * state[i] + sum(state).
 */

export { MAT_DIAG4_M_1 } from './roundConstants';
