/**
 * Activation functions and their derivatives (for backprop).
 * All work element-wise on numbers.
 */

export function sigmoid(x: number): number {
  if (x >= 0) {
    const e = Math.exp(-x)
    return 1 / (1 + e)
  }
  const e = Math.exp(x)
  return e / (1 + e)
}

/** d(sigmoid)/dx = s * (1 - s). Pass the pre-activation z to compute from cache. */
export function sigmoidDerivative(z: number): number {
  const s = sigmoid(z)
  return s * (1 - s)
}

export function relu(x: number): number {
  return x > 0 ? x : 0
}

/** d(relu)/dx = 1 if x > 0 else 0. Pass pre-activation z. */
export function reluDerivative(z: number): number {
  return z > 0 ? 1 : 0
}
