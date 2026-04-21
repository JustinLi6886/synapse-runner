import { NeuralNetwork } from "@/nn/NeuralNetwork"
import { createGameState, step, getObservation } from "@/game/engine"
import { SIM_VIEW_WIDTH } from "@/game/config"
import type { Action } from "@/game/types"

const FIXED_DT = 1 / 60
const MAX_EVAL_SCORE = 1000000

function createSeededRandom(seed: number): () => number {
  let s = seed
  return () => {
    let t = (s += 0x6d2b79f5) | 0
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussianPair(rng: () => number): [number, number] {
  const u1 = Math.max(1e-10, rng())
  const u2 = rng()
  const r = Math.sqrt(-2 * Math.log(u1))
  const theta = 2 * Math.PI * u2
  return [r * Math.cos(theta), r * Math.sin(theta)]
}

function evaluateFitness(
  nn: NeuralNetwork,
  seeds: number[],
  threshold: number,
): number {
  if (seeds.length === 0) return 0
  let totalScore = 0
  for (let i = 0; i < seeds.length; i++) {
    let state = createGameState(SIM_VIEW_WIDTH, seeds[i])
    while (!state.gameOver && state.distance < MAX_EVAL_SCORE) {
      const obs = getObservation(state)
      const grounded = state.playerY <= 0
      let action: Action = 0
      if (grounded) {
        const pJump = nn.predictOnly(obs)
        if (pJump >= threshold) action = 1
      }
      const result = step(state, action, FIXED_DT)
      state = result.state
    }
    totalScore += Math.floor(state.distance)
  }
  return totalScore / seeds.length
}

function mutateNetwork(nn: NeuralNetwork, sigma: number, rng: () => number): void {
  const weights = nn.getWeights()
  const biases = nn.getBiases()
  for (let l = 0; l < weights.length; l++) {
    for (let i = 0; i < weights[l].length; i++) {
      for (let j = 0; j < weights[l][i].length; j += 2) {
        const [n1, n2] = gaussianPair(rng)
        weights[l][i][j] += sigma * n1
        if (j + 1 < weights[l][i].length) {
          weights[l][i][j + 1] += sigma * n2
        }
      }
    }
    for (let i = 0; i < biases[l].length; i += 2) {
      const [n1, n2] = gaussianPair(rng)
      biases[l][i] += sigma * n1
      if (i + 1 < biases[l].length) {
        biases[l][i + 1] += sigma * n2
      }
    }
  }
  nn.loadWeights(weights, biases)
}

export interface EvolutionConfig {
  populationSize: number
  eliteCount: number
  mutationSigma: number
  evalSeeds: number
  threshold: number
}

interface GenerationResult {
  bestFitness: number
  avgFitness: number
  fitnesses: number[]
}

export function evolveGeneration(
  population: NeuralNetwork[],
  config: EvolutionConfig,
  generationSeed: number,
  shouldStop?: () => boolean,
): { result: GenerationResult; population: NeuralNetwork[] } | null {
  const { populationSize, eliteCount, mutationSigma, evalSeeds, threshold } = config

  if (populationSize < 1) return null

  const popLen = population.length
  if (popLen === 0) return null

  const seedRng = createSeededRandom(generationSeed)
  const seeds: number[] = []
  for (let i = 0; i < evalSeeds; i++) {
    seeds.push(Math.floor(seedRng() * 2147483647))
  }

  const fitnesses: number[] = []
  for (let i = 0; i < popLen; i++) {
    if (shouldStop?.()) return null
    fitnesses.push(evaluateFitness(population[i], seeds, threshold))
  }

  const indices = Array.from({ length: popLen }, (_, i) => i)
  indices.sort((a, b) => fitnesses[b] - fitnesses[a])

  const sortedFitnesses = indices.map((i) => fitnesses[i])
  const avgFitness = sortedFitnesses.reduce((a, b) => a + b, 0) / popLen

  const numElites = Math.min(Math.max(1, eliteCount), populationSize, popLen)

  const nextPop: NeuralNetwork[] = []

  for (let i = 0; i < numElites; i++) {
    nextPop.push(population[indices[i]].clone())
  }

  const mutRng = createSeededRandom(generationSeed ^ 0x12345678)
  for (let i = numElites; i < populationSize; i++) {
    const parentIdx = Math.floor(mutRng() * numElites)
    const child = nextPop[parentIdx].clone()
    const childRng = createSeededRandom(generationSeed * 31 + i * 7919)
    mutateNetwork(child, mutationSigma, childRng)
    nextPop.push(child)
  }

  return {
    result: {
      bestFitness: sortedFitnesses[0],
      avgFitness,
      fitnesses: sortedFitnesses,
    },
    population: nextPop,
  }
}

export function createPopulation(
  size: number,
  layers: number[],
  learningRate: number,
): NeuralNetwork[] {
  const pop: NeuralNetwork[] = []
  for (let i = 0; i < size; i++) {
    pop.push(new NeuralNetwork({ layers, learningRate, seed: i * 997 + 42 }))
  }
  return pop
}
