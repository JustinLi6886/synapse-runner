import { describe, expect, it } from 'vitest'
import { NeuralNetwork } from './NeuralNetwork'

function binaryCrossEntropy(prediction: number, target: number): number {
  const clipped = Math.max(1e-7, Math.min(1 - 1e-7, prediction))
  return -(target * Math.log(clipped) + (1 - target) * Math.log(1 - clipped))
}

describe('NeuralNetwork', () => {
  it('matches a finite-difference gradient for BCE training', () => {
    const learningRate = 1e-4
    const epsilon = 1e-5
    const input = [0.2, -0.4]
    const target = 1
    const network = new NeuralNetwork({ layers: [2, 1], learningRate, seed: 17 })
    const weights = network.getWeights()
    const biases = network.getBiases()

    const lossAt = (weight: number) => {
      const candidate = network.clone()
      const nextWeights = candidate.getWeights()
      nextWeights[0][0][0] = weight
      candidate.loadWeights(nextWeights, biases)
      return binaryCrossEntropy(candidate.predictOnly(input), target)
    }

    const initialWeight = weights[0][0][0]
    const finiteDifference =
      (lossAt(initialWeight + epsilon) - lossAt(initialWeight - epsilon)) / (2 * epsilon)

    network.trainBatch([input], [[target]])
    const updateGradient = (initialWeight - network.getWeights()[0][0][0]) / learningRate

    expect(updateGradient).toBeCloseTo(finiteDifference, 5)
  })

  it('round-trips serialized parameters without changing predictions', () => {
    const network = new NeuralNetwork({ layers: [3, 4, 1], learningRate: 0.01, seed: 99 })
    const input = [0.25, 0.5, 0.75]
    const restored = NeuralNetwork.fromWeights(network.exportWeights())

    expect(restored.getLayerSizes()).toEqual([3, 4, 1])
    expect(restored.predictOnly(input)).toBe(network.predictOnly(input))
  })

  it('rejects malformed, mismatched, and non-finite model imports', () => {
    const network = new NeuralNetwork({ layers: [2, 2, 1], learningRate: 0.01, seed: 5 })
    const exported = JSON.parse(network.exportWeights()) as {
      weights: number[][][]
      biases: number[][]
    }

    const shortRow = structuredClone(exported)
    shortRow.weights[0][0].pop()
    expect(() => NeuralNetwork.fromWeights(JSON.stringify(shortRow))).toThrow(
      'Weight/biases shape mismatch',
    )

    const extraBias = structuredClone(exported)
    extraBias.biases[1].push(0)
    expect(() => NeuralNetwork.fromWeights(JSON.stringify(extraBias))).toThrow(
      'Weight/biases shape mismatch',
    )

    const nonFinite = structuredClone(exported)
    nonFinite.weights[0][0][0] = Number.POSITIVE_INFINITY
    expect(() => NeuralNetwork.fromWeights(JSON.stringify(nonFinite))).toThrow(
      'Weights and biases must contain finite numbers',
    )
  })
})
