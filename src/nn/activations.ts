/** Element-wise activations and derivatives (used in backprop). */
export function sigmoid(x: number): number {
  if (x >= 0) {
    const e = Math.exp(-x)
    return 1 / (1 + e)
  }
  const e = Math.exp(x)
  return e / (1 + e)
}

/** s * (1 - s), pass pre-activation z. */
export function sigmoidDerivative(z: number): number {
  const s = sigmoid(z)
  return s * (1 - s)
}

export function relu(x: number): number {
  return x > 0 ? x : 0
}

/** 1 if z > 0 else 0. */
export function reluDerivative(z: number): number {
  return z > 0 ? 1 : 0
}
