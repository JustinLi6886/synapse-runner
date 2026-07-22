import type { NeuralNetworkConfig } from './types'
import { leakyRelu, leakyReluDerivative, sigmoid } from './activations'
import { binaryCrossEntropyBatch } from './loss'
import { sanitizeImportedText } from '@/lib/sanitize'

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

  private repairNonFiniteParameters(): void {
    for (let l = 0; l < this.weights.length; l++) {
      for (let i = 0; i < this.weights[l].length; i++) {
        for (let j = 0; j < this.weights[l][i].length; j++) {
          const w = this.weights[l][i][j]
          this.weights[l][i][j] = Number.isFinite(w) ? w : 0
        }
      }
      for (let i = 0; i < this.biases[l].length; i++) {
        const b = this.biases[l][i]
        this.biases[l][i] = Number.isFinite(b) ? b : 0
      }
    }
  }

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
      if (nIn < 1 || nOut < 1) {
        throw new Error('NeuralNetwork: layer sizes must be positive')
      }
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
    const inDim = this.layers[0]
    const cleanIn: number[] = new Array(inDim)
    for (let j = 0; j < inDim; j++) {
      const v = j < input.length ? input[j] : 0
      cleanIn[j] = Number.isFinite(v) ? v : 0
    }
    this.cachedA = [cleanIn]
    this.cachedZ = []

    let a = cleanIn
    for (let l = 0; l < L; l++) {
      const nOut = this.weights[l].length
      const nIn = this.layers[l]
      const z: number[] = []
      for (let i = 0; i < nOut; i++) {
        let sum = this.biases[l][i]
        for (let j = 0; j < nIn; j++) {
          const aj = j < a.length ? a[j] : 0
          sum += this.weights[l][i][j] * aj
        }
        z[i] = sum
      }
      this.cachedZ.push(z)
      const isLast = l === L - 1
      a = z.map((v) => (isLast
        ? (this.outputActivation === 'linear' ? v : sigmoid(Math.max(-3, Math.min(3, v))))
        : leakyRelu(v)))
      this.cachedA.push(a)
    }
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i])) {
        a[i] = this.outputActivation === 'linear' ? 0 : 0.5
      }
    }
    return a
  }

  predict(input: number[]): number[] {
    return this.forward(input)
  }

  private _inferBufs: number[][] | null = null

  predictOnly(input: number[]): number {
    if (!this._inferBufs) {
      this._inferBufs = []
      for (let l = 0; l < this.weights.length; l++) {
        this._inferBufs[l] = new Array(this.weights[l].length)
      }
    }
    const inDim = this.layers[0]
    let a: number[] = new Array(inDim)
    for (let j = 0; j < inDim; j++) {
      const v = j < input.length ? input[j] : 0
      a[j] = Number.isFinite(v) ? v : 0
    }
    const L = this.weights.length
    for (let l = 0; l < L; l++) {
      const W = this.weights[l]
      const b = this.biases[l]
      const nOut = W.length
      const out = this._inferBufs[l]
      const isLast = l === L - 1
      const nIn = this.layers[l]
      for (let i = 0; i < nOut; i++) {
        let sum = b[i]
        const Wi = W[i]
        for (let j = 0; j < nIn; j++) {
          const aj = j < a.length ? a[j] : 0
          sum += Wi[j] * aj
        }
        out[i] = isLast
          ? (this.outputActivation === 'linear' ? sum : sigmoid(Math.max(-3, Math.min(3, sum))))
          : leakyRelu(sum)
      }
      a = out
    }
    let r = a[0]
    if (!Number.isFinite(r)) r = this.outputActivation === 'linear' ? 0 : 0.5
    return r
  }

  predictLastLogitClamped(input: number[]): number {
    this.forward(input)
    const L = this.weights.length
    const z = this.cachedZ[L - 1][0]
    return Math.max(-3, Math.min(3, z))
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
      let dLdz: number[] = [p - y]
      for (let l = L - 1; l >= 0; l--) {
        const aPrev = this.cachedA[l]
        const nOut = this.weights[l].length
        const nIn = this.layers[l]
        for (let o = 0; o < nOut; o++) {
          for (let j = 0; j < nIn; j++) {
            const aj = j < aPrev.length ? aPrev[j] : 0
            gradW[l][o][j] += dLdz[o] * aj
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
        dLdz = daPrev.map((v, j) => v * leakyReluDerivative(j < zPrev.length ? zPrev[j] : 0))
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

    this.repairNonFiniteParameters()
    return { loss }
  }

  trainMSE(inputs: number[][], targets: number[][], stepLr?: number): { loss: number } {
    const N = inputs.length
    if (N === 0) return { loss: 0 }
    const lrStep = stepLr ?? this.learningRate

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

      let dLdz: number[] = [(2 * (pred - target)) / N]
      for (let l = L - 1; l >= 0; l--) {
        const aPrev = this.cachedA[l]
        const nOut = this.weights[l].length
        const nIn = this.layers[l]
        for (let o = 0; o < nOut; o++) {
          for (let j = 0; j < nIn; j++) {
            const aj = j < aPrev.length ? aPrev[j] : 0
            gradW[l][o][j] += dLdz[o] * aj
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
        dLdz = daPrev.map((v, j) => v * leakyReluDerivative(j < zPrev.length ? zPrev[j] : 0))
      }
    }

    for (let l = 0; l < L; l++) {
      const nOut = this.weights[l].length
      const nIn = this.weights[l][0].length
      for (let i = 0; i < nOut; i++) {
        this.biases[l][i] -= lrStep * gradB[l][i]
        for (let j = 0; j < nIn; j++) {
          this.weights[l][i][j] -= lrStep * gradW[l][i][j]
        }
      }
    }

    this.repairNonFiniteParameters()
    return { loss: totalLoss / N }
  }

  policyGradientUpdate(
    inputs: number[][],
    actions: number[],
    advantages: number[],
    opts?: { clipGrad?: number; lr?: number; entropyCoef?: number; samplingTemperature?: number }
  ): void {
    const N = inputs.length
    if (N === 0) return
    const clipGrad = opts?.clipGrad ?? 1
    const lr = opts?.lr ?? this.learningRate
    const entropyCoef = opts?.entropyCoef ?? 0.08
    const T0 = opts?.samplingTemperature ?? 1
    const T = T0 > 1e-6 ? T0 : 1

    const L = this.weights.length
    const gradW: number[][][] = this.weights.map((W) =>
      W.map((row) => row.map(() => 0))
    )
    const gradB: number[][] = this.biases.map((b) => b.map(() => 0))

    for (let i = 0; i < N; i++) {
      this.forward(inputs[i])
      const zLast = this.cachedZ[L - 1][0]
      const action = actions[i]
      const A = advantages[i]
      let p: number
      if (this.outputActivation === 'linear') {
        p = this.cachedA[this.cachedA.length - 1][0]
      } else {
        const zc = Math.max(-3, Math.min(3, zLast))
        p = sigmoid(zc / T)
      }
      if (!Number.isFinite(p) || !Number.isFinite(A)) continue
      const pc = this.outputActivation === 'linear' ? p : Math.max(1e-7, Math.min(1 - 1e-7, p))
      const dEntropyDz =
        this.outputActivation === 'linear'
          ? 0
          : (pc * (1 - pc) * (Math.log(1 - pc) - Math.log(pc))) / T
      const policyTerm =
        this.outputActivation === 'linear' ? (p - action) * A : ((p - action) * A) / T
      let dLdz: number[] = [policyTerm - entropyCoef * dEntropyDz]
      for (let l = L - 1; l >= 0; l--) {
        const aPrev = this.cachedA[l]
        const nOut = this.weights[l].length
        const nIn = this.layers[l]
        for (let o = 0; o < nOut; o++) {
          for (let j = 0; j < nIn; j++) {
            const aj = j < aPrev.length ? aPrev[j] : 0
            gradW[l][o][j] += dLdz[o] * aj
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
        dLdz = daPrev.map((v, j) => v * leakyReluDerivative(j < zPrev.length ? zPrev[j] : 0))
      }
    }

    for (let l = 0; l < L; l++) {
      for (let i = 0; i < gradW[l].length; i++) {
        for (let j = 0; j < gradW[l][i].length; j++) gradW[l][i][j] /= N
      }
      for (let i = 0; i < gradB[l].length; i++) gradB[l][i] /= N
    }

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

    this.repairNonFiniteParameters()
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

  expandFirstLayerInputDim(newInputDim: number): void {
    const oldIn = this.layers[0]
    if (newInputDim <= oldIn) return
    const pad = newInputDim - oldIn
    const W0 = this.weights[0]
    for (let i = 0; i < W0.length; i++) {
      for (let k = 0; k < pad; k++) W0[i].push(0)
    }
    this.layers[0] = newInputDim
    this._inferBufs = null
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
    if (!Array.isArray(weights) || !Array.isArray(biases)) {
      throw new Error("Weight/biases shape mismatch")
    }
    if (weights.length !== this.weights.length || biases.length !== this.biases.length) {
      throw new Error("Weight/biases shape mismatch")
    }
    for (let l = 0; l < weights.length; l++) {
      const expectedRows = this.layers[l + 1]
      const expectedColumns = this.layers[l]
      if (
        !Array.isArray(weights[l]) ||
        weights[l].length !== expectedRows ||
        !Array.isArray(biases[l]) ||
        biases[l].length !== expectedRows
      ) {
        throw new Error("Weight/biases shape mismatch")
      }
      for (let i = 0; i < weights[l].length; i++) {
        if (!Array.isArray(weights[l][i]) || weights[l][i].length !== expectedColumns) {
          throw new Error("Weight/biases shape mismatch")
        }
        for (let j = 0; j < weights[l][i].length; j++) {
          const value = weights[l][i][j]
          if (typeof value !== "number" || !Number.isFinite(value)) {
            throw new Error("Weights and biases must contain finite numbers")
          }
        }
      }
      for (let i = 0; i < biases[l].length; i++) {
        const value = biases[l][i]
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error("Weights and biases must contain finite numbers")
        }
      }
    }
    this.weights = weights.map((layer) => layer.map((row) => [...row]))
    this.biases = biases.map((layer) => [...layer])
    this._inferBufs = null
  }

  static fromWeights(json: string): NeuralNetwork {
    const text = sanitizeImportedText(json)
    if (!text) throw new Error('Invalid model JSON')
    let data: {
      layers: number[]
      learningRate: number
      outputActivation?: 'sigmoid' | 'linear'
      weights: number[][][]
      biases: number[][]
    }
    try {
      data = JSON.parse(text) as typeof data
    } catch {
      throw new Error('Invalid model JSON')
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.layers) || data.layers.length < 2) {
      throw new Error('Invalid model shape')
    }
    for (let i = 0; i < data.layers.length; i++) {
      const d = data.layers[i]
      if (typeof d !== 'number' || !Number.isFinite(d) || d < 1 || d > 4096) {
        throw new Error('Invalid layer sizes')
      }
    }
    const rawLr = typeof data.learningRate === 'number' && Number.isFinite(data.learningRate) ? data.learningRate : 0.01
    const lr = Math.min(100, Math.max(1e-10, rawLr))
    const act = data.outputActivation === 'linear' ? 'linear' : 'sigmoid'
    if (!Array.isArray(data.weights) || !Array.isArray(data.biases)) {
      throw new Error('Invalid model shape')
    }
    const nn = new NeuralNetwork({
      layers: data.layers,
      learningRate: lr,
      outputActivation: act,
      seed: 0,
    })
    nn.loadWeights(data.weights, data.biases)
    return nn
  }
}
