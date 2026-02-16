/** BCE for one output; clamp p so we don't hit log(0). */
const EPS = 1e-7

export function binaryCrossEntropy(p: number, y: number): number {
  const pc = Math.max(EPS, Math.min(1 - EPS, p))
  return -(y * Math.log(pc) + (1 - y) * Math.log(1 - pc))
}

/** Average BCE over batch (each prediction/target is a scalar). */
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

/** dL/dp for one sample; with sigmoid out the combined dL/dz is (p - y). */
export function binaryCrossEntropyDerivative(p: number, y: number): number {
  const pc = Math.max(EPS, Math.min(1 - EPS, p))
  return (pc - y) / (pc * (1 - pc))
}
