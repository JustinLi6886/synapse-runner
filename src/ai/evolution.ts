import { NeuralNetwork } from "@/nn/NeuralNetwork"
import { createGameState, step, getObservation } from "@/game/engine"
import type { Action } from "@/game/types"

const FIXED_DT = 1 / 60
const VIEW_WIDTH = 800
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

// Box-Muller transform: uniform [0,1) pair → standard normal
function gaussianPair(rng: () => number): [number, number] {
  const u1 = Math.max(1e-10, rng())
  const u2 = rng()
  const r = Math.sqrt(-2 * Math.log(u1))
  const theta = 2 * Math.PI * u2
  return [r * Math.cos(theta), r * Math.sin(theta)]
}

/**
 * Evaluate a single network's fitness: average score over multiple seeds.
 * No proximity gate — agent decides on every grounded frame.
 */
export function evaluateFitness(
  nn: NeuralNetwork,
  seeds: number[],
  threshold: number,
): number {
  let totalScore = 0
  for (let i = 0; i < seeds.length; i++) {
    let state = createGameState(VIEW_WIDTH, seeds[i])
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

/**
 * Mutate a network's weights and biases in-place with Gaussian noise.
 * Each child gets its own RNG stream seeded by (genSeed + childIndex).
 */
function mutateNetwork(nn: NeuralNetwork, sigma: number, rng: () => number): void {
  const weights = nn.getWeights()
  const biases = nn.getBiases()
  // weights[layer][out][in]
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
    // biases[layer][out]
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

export interface GenerationResult {
  bestFitness: number
  avgFitness: number
  fitnesses: number[]
}

/**
 * Run one generation of evolution.
 * 1. Evaluate all individuals
 * 2. Sort by fitness (descending)
 * 3. Keep elites unchanged
 * 4. Fill rest by cloning random elites + Gaussian mutation
 *
 * Returns the result and the new population (elites first, then mutated children).
 * The population array is reordered: indices [0..eliteCount) are elites.
 */
export function evolveGeneration(
  population: NeuralNetwork[],
  config: EvolutionConfig,
  generationSeed: number,
  shouldStop?: () => boolean,
): { result: GenerationResult; population: NeuralNetwork[] } | null {
  const { populationSize, eliteCount, mutationSigma, evalSeeds, threshold } = config

  // Build eval seeds from generation seed
  const seedRng = createSeededRandom(generationSeed)
  const seeds: number[] = []
  for (let i = 0; i < evalSeeds; i++) {
    seeds.push(Math.floor(seedRng() * 2147483647))
  }

  // Evaluate fitness for each individual
  const fitnesses: number[] = []
  for (let i = 0; i < population.length; i++) {
    if (shouldStop?.()) return null
    fitnesses.push(evaluateFitness(population[i], seeds, threshold))
  }

  // Sort indices by fitness descending
  const indices = Array.from({ length: populationSize }, (_, i) => i)
  indices.sort((a, b) => fitnesses[b] - fitnesses[a])

  const sortedFitnesses = indices.map((i) => fitnesses[i])
  const avgFitness = sortedFitnesses.reduce((a, b) => a + b, 0) / populationSize

  // Build next generation
  const nextPop: NeuralNetwork[] = []

  // Elites survive unchanged
  for (let i = 0; i < eliteCount; i++) {
    nextPop.push(population[indices[i]].clone())
  }

  // Fill remaining slots: clone a random elite, then mutate
  const mutRng = createSeededRandom(generationSeed ^ 0x12345678)
  for (let i = eliteCount; i < populationSize; i++) {
    const parentIdx = Math.floor(mutRng() * eliteCount)
    const child = nextPop[parentIdx].clone()
    // Each child gets its own independent RNG stream
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

/**
 * Create an initial random population.
 */
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
