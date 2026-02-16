/**
 * Fully-connected MLP from scratch.
 * ReLU hidden layers, Sigmoid output layer.
 * weights[layer][out][in] = weight from prev neuron `in` to neuron `out` in next layer.
 * biases[layer][out] = bias for neuron `out` in next layer.
 */

import type { NeuralNetworkConfig } from './types'
import { relu, reluDerivative, sigmoid, sigmoidDerivative } from './activations'
import { binaryCrossEntropyBatch } from './loss'

/** Simple seeded RNG for reproducible init (mulberry32). */
function createSeededRandom(seed: number): () => number {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class NeuralNetwork {
  /** layers[0]=input size, layers[L]=output size. */
  private readonly layers: number[]
  private readonly learningRate: number
  /** W[l][i][j] = weight from prev neuron j to neuron i in layer l (next layer). */
  private weights: number[][][]
  /** biases[l][i] = bias for neuron i in layer l (next layer). */
  private biases: number[][]

  /** Cached during forward for backprop: pre-activation z and activation a per layer. */
  private cachedZ: number[][] = []
  private cachedA: number[][] = []

  constructor(config: NeuralNetworkConfig) {
    const { layers, learningRate, seed = 42 } = config
    this.layers = [...layers]
    this.learningRate = learningRate
    const rng = createSeededRandom(seed)

    this.weights = []
    this.biases = []
    // He init for ReLU: std = sqrt(2/n_in). Last layer is sigmoid, use smaller scale.
    for (let l = 0; l < layers.length - 1; l++) {
      const nIn = layers[l]
      const nOut = layers[l + 1]
      const isLast = l === layers.length - 2
      const scale = isLast ? Math.sqrt(1 / nIn) : Math.sqrt(2 / nIn)
      const W: number[][] = []
      for (let i = 0; i < nOut; i++) {
        W[i] = []
        for (let j = 0; j < nIn; j++) {
          W[i][j] = (rng() * 2 - 1) * scale
        }
      }
      this.weights.push(W)
      const b: number[] = []
      for (let i = 0; i < nOut; i++) b[i] = 0
      this.biases.push(b)
    }
  }

  /**
   * Forward pass. Returns output activations (last layer).
   * Caches z and a for each layer for backprop.
   * a[0] = input, a[1..L] = hidden then output.
   */
  forward(input: number[]): number[] {
    const L = this.weights.length
    this.cachedA = [input]
    this.cachedZ = []

    let a = input
    for (let l = 0; l < L; l++) {
      // z[l] = W[l] @ a + b[l]; shape (nOut,)
      const nOut = this.weights[l].length
      const nIn = a.length
      const z: number[] = []
      for (let i = 0; i < nOut; i++) {
        let sum = this.biases[l][i]
        for (let j = 0; j < nIn; j++) sum += this.weights[l][i][j] * a[j]
        z[i] = sum
      }
      this.cachedZ.push(z)
      const isLast = l === L - 1
      a = z.map((v) => (isLast ? sigmoid(v) : relu(v)))
      this.cachedA.push(a)
    }
    return a
  }

  /** Same as forward; for API clarity when we only care about prediction. */
  predict(input: number[]): number[] {
    return this.forward(input)
  }

  /**
   * Mini-batch SGD: one forward pass over batch, then backprop and update.
   * targets[i] = desired output for inputs[i] (single output = one number per sample).
   */
  trainBatch(inputs: number[][], targets: number[][]): { loss: number } {
    const N = inputs.length
    if (N === 0) return { loss: 0 }

    // Forward all samples and compute average loss
    const predictions: number[] = []
    for (let i = 0; i < N; i++) {
      const out = this.forward(inputs[i])
      predictions.push(out[0])
    }
    const loss = binaryCrossEntropyBatch(
      predictions,
      targets.map((t) => t[0])
    )

    // Backprop: accumulate gradients over batch then average and update.
    const L = this.weights.length
    // gradW[l][i][j], gradB[l][i]
    const gradW: number[][][] = this.weights.map((W) =>
      W.map((row) => row.map(() => 0))
    )
    const gradB: number[][] = this.biases.map((b) => b.map(() => 0))

    for (let i = 0; i < N; i++) {
      this.forward(inputs[i])
      // dL/dz at output: (p - y) for BCE+sigmoid combined gradient
      const outA = this.cachedA[this.cachedA.length - 1]
      const y = targets[i][0]
      const p = outA[0]
      // BCE + sigmoid: combined gradient at output z is (p - y)
      const dLdzOut = p - y

      // Backprop through layers (last to first). dLdz = gradient at z for current layer.
      let dLdz: number[] = [dLdzOut]
      for (let l = L - 1; l >= 0; l--) {
        const aPrev = this.cachedA[l]
        const nOut = this.weights[l].length
        const nIn = aPrev.length
        // dL/dW[l] += dLdz (nOut,) @ aPrev^T (nIn,) -> (nOut, nIn)
        for (let i = 0; i < nOut; i++) {
          for (let j = 0; j < nIn; j++) {
            gradW[l][i][j] += dLdz[i] * aPrev[j]
          }
          gradB[l][i] += dLdz[i]
        }
        if (l === 0) break
        // dL/da_prev = W[l]^T @ dLdz  (nIn,)
        const daPrev: number[] = []
        for (let j = 0; j < nIn; j++) {
          let sum = 0
          for (let i = 0; i < nOut; i++) sum += this.weights[l][i][j] * dLdz[i]
          daPrev[j] = sum
        }
        // dL/dz_prev = dL/da_prev * relu'(z_prev)
        const zPrev = this.cachedZ[l - 1]
        dLdz = daPrev.map((v, j) => v * reluDerivative(zPrev[j]))
      }
    }

    // Average gradients and update weights
    for (let l = 0; l < L; l++) {
      const nOut = this.weights[l].length
      const nIn = this.weights[l][0].length
      for (let i = 0; i < nOut; i++) {
        this.biases[l][i] -= (this.learningRate * gradB[l][i]) / N
        for (let j = 0; j < nIn; j++) {
          this.weights[l][i][j] -= (this.learningRate * gradW[l][i][j]) / N
        }
      }
    }

    return { loss }
  }

  getWeights(): number[][][] {
    return this.weights.map((W) => W.map((row) => [...row]))
  }

  getBiases(): number[][] {
    return this.biases.map((b) => [...b])
  }
}
