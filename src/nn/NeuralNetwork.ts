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
  private readonly outputActivation: 'sigmoid' | 'linear'
  private weights: number[][][]
  private biases: number[][]
  private cachedZ: number[][] = []
  private cachedA: number[][] = []

  constructor(config: NeuralNetworkConfig) {
    const { layers, learningRate, seed = 42, outputBias = 0, outputActivation = 'sigmoid' } = config
    this.outputActivation = outputActivation
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
      for (let i = 0; i < nOut; i++) b[i] = isLast ? outputBias : 0
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
      a = z.map((v) => (isLast
        ? (this.outputActivation === 'linear' ? v : sigmoid(Math.max(-3, Math.min(3, v))))
        : leakyRelu(v)))
      this.cachedA.push(a)
    }
    return a
  }

  predict(input: number[]): number[] {
    return this.forward(input)
  }

  // Zero-allocation inference: reuses pre-allocated layer buffers.
  // Returns scalar (first output neuron). Use for hot loops where
  // backprop caching is not needed (episode sim, GAE, eval).
  private _inferBufs: number[][] | null = null

  predictOnly(input: number[]): number {
    if (!this._inferBufs) {
      this._inferBufs = []
      for (let l = 0; l < this.weights.length; l++) {
        this._inferBufs[l] = new Array(this.weights[l].length)
      }
    }
    let a = input
    const L = this.weights.length
    for (let l = 0; l < L; l++) {
      const W = this.weights[l]
      const b = this.biases[l]
      const nOut = W.length
      const out = this._inferBufs[l]
      const isLast = l === L - 1
      for (let i = 0; i < nOut; i++) {
        let sum = b[i]
        const Wi = W[i]
        for (let j = 0; j < a.length; j++) sum += Wi[j] * a[j]
        out[i] = isLast
          ? (this.outputActivation === 'linear' ? sum : sigmoid(Math.max(-3, Math.min(3, sum))))
          : leakyRelu(sum)
      }
      a = out
    }
    return a[0]
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

    for (let s = 0; s < N; s++) {
      this.forward(inputs[s])
      const outA = this.cachedA[this.cachedA.length - 1]
      const y = targets[s][0]
      const p = outA[0]
      // BCE+sigmoid combined gradient: dL/dz = (p - y)
      let dLdz: number[] = [p - y]
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

  trainMSE(inputs: number[][], targets: number[][]): { loss: number } {
    const N = inputs.length
    if (N === 0) return { loss: 0 }

    const L = this.weights.length
    const gradW: number[][][] = this.weights.map((W) =>
      W.map((row) => row.map(() => 0))
    )
    const gradB: number[][] = this.biases.map((b) => b.map(() => 0))
    let totalLoss = 0

    for (let i = 0; i < N; i++) {
      const out = this.forward(inputs[i])
      const target = targets[i][0]
      const pred = out[0]
      totalLoss += (pred - target) ** 2

      // dL/dz = 2(pred - target) / N for linear output
      let dLdz: number[] = [(2 * (pred - target)) / N]
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

    for (let l = 0; l < L; l++) {
      const nOut = this.weights[l].length
      const nIn = this.weights[l][0].length
      for (let i = 0; i < nOut; i++) {
        this.biases[l][i] -= this.learningRate * gradB[l][i]
        for (let j = 0; j < nIn; j++) {
          this.weights[l][i][j] -= this.learningRate * gradW[l][i][j]
        }
      }
    }

    return { loss: totalLoss / N }
  }

  /**
   * REINFORCE update with per-layer gradient clipping.
   * Gradients averaged over N training samples (not episodes).
   */
  policyGradientUpdate(
    inputs: number[][],
    actions: number[],
    returns: number[],
    opts?: { clipGrad?: number; lr?: number; entropyCoef?: number }
  ): void {
    const N = inputs.length
    if (N === 0) return
    const clipGrad = opts?.clipGrad ?? 1
    const lr = opts?.lr ?? this.learningRate
    const entropyCoef = opts?.entropyCoef ?? 0.08

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
      // Use clamped z so entropy term matches clamped sigmoid in forward pass
      const zRaw = this.cachedZ[this.cachedZ.length - 1][0]
      const z = this.outputActivation === 'linear' ? zRaw : Math.max(-3, Math.min(3, zRaw))
      // dL/dz: REINFORCE term + entropy regularization (dH/dz = -z*p*(1-p) for Bernoulli(σ(z)))
      let dLdz: number[] = [(p - action) * G + entropyCoef * z * p * (1 - p)]
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

    // Average over training samples
    for (let l = 0; l < L; l++) {
      for (let i = 0; i < gradW[l].length; i++) {
        for (let j = 0; j < gradW[l][i].length; j++) gradW[l][i][j] /= N
      }
      for (let i = 0; i < gradB[l].length; i++) gradB[l][i] /= N
    }

    // Per-layer gradient clipping: clip each layer independently so the
    // output layer can't dominate and starve earlier feature-learning layers
    for (let l = 0; l < L; l++) {
      let layerSq = 0
      for (let i = 0; i < gradW[l].length; i++) {
        for (let j = 0; j < gradW[l][i].length; j++) {
          layerSq += gradW[l][i][j] * gradW[l][i][j]
        }
      }
      for (let i = 0; i < gradB[l].length; i++) {
        layerSq += gradB[l][i] * gradB[l][i]
      }
      const layerScale = clipGrad > 0 && layerSq > clipGrad * clipGrad
        ? clipGrad / Math.sqrt(layerSq) : 1

      const nOut = this.weights[l].length
      const nIn = this.weights[l][0].length
      for (let i = 0; i < nOut; i++) {
        this.biases[l][i] -= lr * gradB[l][i] * layerScale
        for (let j = 0; j < nIn; j++) {
          this.weights[l][i][j] -= lr * gradW[l][i][j] * layerScale
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

  clone(): NeuralNetwork {
    const nn = new NeuralNetwork({
      layers: this.layers,
      learningRate: this.learningRate,
      outputActivation: this.outputActivation,
      seed: 0,
    })
    nn.loadWeights(this.getWeights(), this.getBiases())
    return nn
  }

  exportWeights(): string {
    return JSON.stringify({
      layers: this.layers,
      learningRate: this.learningRate,
      outputActivation: this.outputActivation,
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
      outputActivation?: 'sigmoid' | 'linear'
      weights: number[][][]
      biases: number[][]
    }
    const nn = new NeuralNetwork({
      layers: data.layers,
      learningRate: data.learningRate,
      outputActivation: data.outputActivation ?? 'sigmoid',
      seed: 0,
    })
    nn.loadWeights(data.weights, data.biases)
    return nn
  }
}
