/**
 * Binary cross-entropy loss for a single output.
 * L = -[y*log(p) + (1-y)*log(1-p)]
 * Clamp p to avoid log(0).
 */

const EPS = 1e-7

export function binaryCrossEntropy(p: number, y: number): number {
  const pc = Math.max(EPS, Math.min(1 - EPS, p))
  return -(y * Math.log(pc) + (1 - y) * Math.log(1 - pc))
}

/**
 * Average BCE over a batch of single outputs.
 * predictions[i], targets[i] are scalars.
 */
export function binaryCrossEntropyBatch(
  predictions: number[],
  targets: number[]
): number {
  let sum = 0
  for (let i = 0; i < predictions.length; i++) {
    sum += binaryCrossEntropy(predictions[i], targets[i])
  }
  return sum / predictions.length
}

/**
 * Derivative of BCE w.r.t. prediction p (for one sample).
 * dL/dp = (p - y) / (p*(1-p)); with sigmoid output the combined gradient
 * (dL/dz) is just (p - y) after applying chain rule with sigmoid'.
 * We use (p - y) as the gradient passed to the output layer.
 */
export function binaryCrossEntropyDerivative(p: number, y: number): number {
  const pc = Math.max(EPS, Math.min(1 - EPS, p))
  return (pc - y) / (pc * (1 - pc))
}
