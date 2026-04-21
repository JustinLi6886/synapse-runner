import { NeuralNetwork } from "@/nn/NeuralNetwork"
import type { DataSample } from "./dataset"

interface EpochResult {
  epoch: number
  loss: number
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function trainImitation(
  nn: NeuralNetwork,
  samples: DataSample[],
  epochs: number,
  batchSize: number,
  onEpoch?: (result: EpochResult) => void,
  shouldStop?: () => boolean,
): Promise<void> {
  for (let epoch = 0; epoch < epochs; epoch++) {
    if (shouldStop?.()) break

    const shuffled = shuffle(samples)
    let totalLoss = 0
    let batches = 0

    for (let i = 0; i < shuffled.length; i += batchSize) {
      const batch = shuffled.slice(i, i + batchSize)
      const inputs = batch.map((s) => s.obs)
      const targets = batch.map((s) => [s.action])
      const { loss } = nn.trainBatch(inputs, targets)
      totalLoss += loss
      batches++
    }

    onEpoch?.({ epoch: epoch + 1, loss: totalLoss / Math.max(1, batches) })

    await new Promise((r) => requestAnimationFrame(r))
  }
}
