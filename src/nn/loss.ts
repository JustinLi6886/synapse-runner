const EPS = 1e-7

function binaryCrossEntropy(p: number, y: number): number {
  const pc = Math.max(EPS, Math.min(1 - EPS, p))
  return -(y * Math.log(pc) + (1 - y) * Math.log(1 - pc))
}

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
