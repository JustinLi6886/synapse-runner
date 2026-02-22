import type { NeuralNetworkConfig } from './types'
import { leakyRelu, leakyReluDerivative, sigmoid } from './activations'
import { binaryCrossEntropyBatch } from './loss'

// weights[layer][out][in], biases[layer][out]
function createSeededRandom(seed: number): () => number {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class NeuralNetwork {
  private readonly layers: number[]
  private readonly learningRate: number
  private weights: number[][][]
  private biases: number[][]
  private cachedZ: number[][] = []
  private cachedA: number[][] = []

  constructor(config: NeuralNetworkConfig) {
    const { layers, learningRate, seed = 42 } = config
    this.layers = [...layers]
    this.learningRate = learningRate
    const rng = createSeededRandom(seed)

    this.weights = []
    this.biases = []
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

  forward(input: number[]): number[] {
    const L = this.weights.length
    this.cachedA = [input]
    this.cachedZ = []

    let a = input
    for (let l = 0; l < L; l++) {
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
      a = z.map((v) => (isLast ? sigmoid(v) : leakyRelu(v)))
      this.cachedA.push(a)
    }
    return a
  }

  predict(input: number[]): number[] {
    return this.forward(input)
  }

  trainBatch(inputs: number[][], targets: number[][]): { loss: number } {
    const N = inputs.length
    if (N === 0) return { loss: 0 }

    const predictions: number[] = []
    for (let i = 0; i < N; i++) {
      const out = this.forward(inputs[i])
      predictions.push(out[0])
    }
    const loss = binaryCrossEntropyBatch(
      predictions,
      targets.map((t) => t[0])
    )

    const L = this.weights.length
    const gradW: number[][][] = this.weights.map((W) =>
      W.map((row) => row.map(() => 0))
    )
    const gradB: number[][] = this.biases.map((b) => b.map(() => 0))

    for (let i = 0; i < N; i++) {
      this.forward(inputs[i])
      const outA = this.cachedA[this.cachedA.length - 1]
      const y = targets[i][0]
      const p = outA[0]
      // BCE+sigmoid combined gradient: dL/dz = (p - y)
      let dLdz: number[] = [p - y]
      for (let l = L - 1; l >= 0; l--) {
        const aPrev = this.cachedA[l]
        const nOut = this.weights[l].length
        const nIn = aPrev.length
        for (let i = 0; i < nOut; i++) {
          for (let j = 0; j < nIn; j++) {
            gradW[l][i][j] += dLdz[i] * aPrev[j]
          }
          gradB[l][i] += dLdz[i]
        }
        if (l === 0) break
        const daPrev: number[] = []
        for (let j = 0; j < nIn; j++) {
          let sum = 0
          for (let i = 0; i < nOut; i++) sum += this.weights[l][i][j] * dLdz[i]
          daPrev[j] = sum
        }
        const zPrev = this.cachedZ[l - 1]
        dLdz = daPrev.map((v, j) => v * leakyReluDerivative(zPrev[j]))
      }
    }

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

  /**
   * Policy gradient (REINFORCE) update.
   * inputs[i] = obs, actions[i] in {0,1}, returns[i] = G_t (discounted return).
   * loss = -sum(G_t * logProb_t). Gradient at output: (p - action) * G.
   */
  policyGradientUpdate(
    inputs: number[][],
    actions: number[],
    returns: number[],
    opts?: { clipGrad?: number; lr?: number }
  ): void {
    const N = inputs.length
    if (N === 0) return
    const clipGrad = opts?.clipGrad ?? 1
    const lr = opts?.lr ?? this.learningRate

    const L = this.weights.length
    const gradW: number[][][] = this.weights.map((W) =>
      W.map((row) => row.map(() => 0))
    )
    const gradB: number[][] = this.biases.map((b) => b.map(() => 0))

    for (let i = 0; i < N; i++) {
      this.forward(inputs[i])
      const outA = this.cachedA[this.cachedA.length - 1]
      const action = actions[i]
      const G = returns[i]
      const p = outA[0]
      // dL/dz = (p - action) * G for REINFORCE
      let dLdz: number[] = [(p - action) * G]
      for (let l = L - 1; l >= 0; l--) {
        const aPrev = this.cachedA[l]
        const nOut = this.weights[l].length
        const nIn = aPrev.length
        for (let o = 0; o < nOut; o++) {
          for (let j = 0; j < nIn; j++) {
            gradW[l][o][j] += dLdz[o] * aPrev[j]
          }
          gradB[l][o] += dLdz[o]
        }
        if (l === 0) break
        const daPrev: number[] = []
        for (let j = 0; j < nIn; j++) {
          let sum = 0
          for (let o = 0; o < nOut; o++) sum += this.weights[l][o][j] * dLdz[o]
          daPrev[j] = sum
        }
        const zPrev = this.cachedZ[l - 1]
        dLdz = daPrev.map((v, j) => v * leakyReluDerivative(zPrev[j]))
      }
    }

    let totalSq = 0
    for (let l = 0; l < L; l++) {
      for (let i = 0; i < gradW[l].length; i++) {
        for (let j = 0; j < gradW[l][i].length; j++) {
          totalSq += gradW[l][i][j] * gradW[l][i][j]
        }
      }
      for (let i = 0; i < gradB[l].length; i++) {
        totalSq += gradB[l][i] * gradB[l][i]
      }
    }
    const scale = clipGrad > 0 && totalSq > clipGrad * clipGrad ? clipGrad / Math.sqrt(totalSq) : 1

    for (let l = 0; l < L; l++) {
      const nOut = this.weights[l].length
      const nIn = this.weights[l][0].length
      for (let i = 0; i < nOut; i++) {
        this.biases[l][i] -= (lr * gradB[l][i] * scale) / N
        for (let j = 0; j < nIn; j++) {
          this.weights[l][i][j] -= (lr * gradW[l][i][j] * scale) / N
        }
      }
    }
  }

  getWeights(): number[][][] {
    return this.weights.map((W) => W.map((row) => [...row]))
  }

  getBiases(): number[][] {
    return this.biases.map((b) => [...b])
  }

  getLayerSizes(): number[] {
    return [...this.layers]
  }

  exportWeights(): string {
    return JSON.stringify({
      layers: this.layers,
      learningRate: this.learningRate,
      weights: this.weights,
      biases: this.biases,
    })
  }

  loadWeights(weights: number[][][], biases: number[][]): void {
    if (
      weights.length !== this.weights.length ||
      biases.length !== this.biases.length
    )
      throw new Error("Weight/biases shape mismatch")
    for (let l = 0; l < weights.length; l++) {
      for (let i = 0; i < weights[l].length; i++) {
        for (let j = 0; j < weights[l][i].length; j++) {
          this.weights[l][i][j] = weights[l][i][j]
        }
      }
      for (let i = 0; i < biases[l].length; i++) {
        this.biases[l][i] = biases[l][i]
      }
    }
  }

  static fromWeights(json: string): NeuralNetwork {
    const data = JSON.parse(json) as {
      layers: number[]
      learningRate: number
      weights: number[][][]
      biases: number[][]
    }
    const nn = new NeuralNetwork({
      layers: data.layers,
      learningRate: data.learningRate,
      seed: 0,
    })
    nn.loadWeights(data.weights, data.biases)
    return nn
  }
}
