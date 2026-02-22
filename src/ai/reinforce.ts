import { NeuralNetwork } from "@/nn/NeuralNetwork"
import { createGameState, step, getObservation } from "@/game/engine"
import type { Action } from "@/game/types"

const FIXED_DT = 1 / 60
const VIEW_WIDTH = 800

export interface TrajectoryStep {
  obs: number[]
  action: Action
  logProb: number
  reward: number
}

export interface EpisodeResult {
  trajectory: TrajectoryStep[]
  score: number
  steps: number
}

/**
 * Run one episode headless with deterministic threshold (for evaluation).
 */
export function runEpisodeEval(
  nn: NeuralNetwork,
  seed: number,
  threshold: number
): { score: number; steps: number } {
  let state = createGameState(VIEW_WIDTH, seed)
  let steps = 0

  while (!state.gameOver) {
    const obs = getObservation(state)
    const pJump = nn.predict(obs)[0]
    const action: Action = pJump >= threshold ? 1 : 0
    const result = step(state, action, FIXED_DT)
    state = result.state
    steps++
  }

  return { score: Math.floor(state.distance), steps }
}

/**
 * Run one episode headless. Sample action from Bernoulli(pJump) for exploration.
 */
export function runEpisode(
  nn: NeuralNetwork,
  seed: number
): EpisodeResult {
  const trajectory: TrajectoryStep[] = []
  let state = createGameState(VIEW_WIDTH, seed)

  while (!state.gameOver) {
    const obs = getObservation(state)
    const pJump = Math.max(1e-8, Math.min(1 - 1e-8, nn.predict(obs)[0]))
    const action: Action = Math.random() < pJump ? 1 : 0
    const logProb =
      action * Math.log(pJump) + (1 - action) * Math.log(1 - pJump)

    const result = step(state, action, FIXED_DT)
    trajectory.push({ obs, action, logProb, reward: result.reward })
    state = result.state
  }

  return {
    trajectory,
    score: Math.floor(state.distance),
    steps: trajectory.length,
  }
}

/**
 * Compute discounted returns G_t = sum_{k>=0} gamma^k * r_{t+k}.
 * Normalize: (G - mean) / (std + eps).
 */
export function computeReturns(
  rewards: number[],
  gamma: number,
  normalize = true
): number[] {
  const G: number[] = []
  let acc = 0
  for (let t = rewards.length - 1; t >= 0; t--) {
    acc = rewards[t] + gamma * acc
    G.unshift(acc)
  }
  if (!normalize || G.length === 0) return G
  const mean = G.reduce((a, b) => a + b, 0) / G.length
  const variance =
    G.reduce((a, b) => a + (b - mean) ** 2, 0) / G.length
  const std = Math.sqrt(variance) + 1e-8
  return G.map((g) => (g - mean) / std)
}

export interface ReinforceConfig {
  gamma: number
  learningRate: number
  clipGrad: number
  episodesPerUpdate: number
  evalSeeds: number[]
}

/**
 * Train one REINFORCE update: collect episodes, compute returns, policy update.
 * If shouldStop returns true, aborts early (no policy update).
 */
export function reinforceUpdate(
  nn: NeuralNetwork,
  config: ReinforceConfig,
  seedBase: number,
  onEpisode?: (result: EpisodeResult) => void,
  shouldStop?: () => boolean
): { avgReturn: number; bestScore: number; totalSteps: number } {
  const allObs: number[][] = []
  const allActions: number[] = []
  const allReturns: number[] = []
  let totalReturn = 0
  let bestScore = 0
  let totalSteps = 0
  let episodesRun = 0

  for (let e = 0; e < config.episodesPerUpdate; e++) {
    if (shouldStop?.()) break
    const seed = seedBase + e * 10007
    const { trajectory, score, steps } = runEpisode(nn, seed)
    episodesRun++
    onEpisode?.({ trajectory, score, steps })

    const rewards = trajectory.map((s) => s.reward)
    const returns = computeReturns(rewards, config.gamma, false)

    for (let t = 0; t < trajectory.length; t++) {
      allObs.push(trajectory[t].obs)
      allActions.push(trajectory[t].action)
      allReturns.push(returns[t])
    }
    totalReturn += rewards.reduce((a, b) => a + b, 0)
    bestScore = Math.max(bestScore, score)
    totalSteps += steps
  }

  if (allObs.length === 0) return { avgReturn: 0, bestScore, totalSteps }

  const mean = allReturns.reduce((a, b) => a + b, 0) / allReturns.length
  const variance = allReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / allReturns.length
  const std = Math.sqrt(variance) + 1e-8
  const normalizedReturns = allReturns.map((g) => (g - mean) / std)

  nn.policyGradientUpdate(allObs, allActions, normalizedReturns, {
    clipGrad: config.clipGrad,
    lr: config.learningRate,
  })

  const avgReturn = episodesRun > 0 ? totalReturn / episodesRun : 0
  return { avgReturn, bestScore, totalSteps }
}

/**
 * Policy update from pre-collected trajectories (e.g. from visual training).
 * scores[i] = game score for trajectories[i].
 */
export function policyUpdateFromTrajectories(
  nn: NeuralNetwork,
  trajectories: TrajectoryStep[][],
  scores: number[],
  config: { gamma: number; learningRate: number; clipGrad: number }
): { avgReturn: number; bestScore: number } {
  const allObs: number[][] = []
  const allActions: number[] = []
  const allReturns: number[] = []
  let totalReturn = 0
  let bestScore = 0

  for (let i = 0; i < trajectories.length; i++) {
    const trajectory = trajectories[i]
    const rewards = trajectory.map((s) => s.reward)
    const returns = computeReturns(rewards, config.gamma, false)
    for (let t = 0; t < trajectory.length; t++) {
      allObs.push(trajectory[t].obs)
      allActions.push(trajectory[t].action)
      allReturns.push(returns[t])
    }
    totalReturn += rewards.reduce((a, b) => a + b, 0)
    bestScore = Math.max(bestScore, scores[i] ?? 0)
  }

  const mean = allReturns.reduce((a, b) => a + b, 0) / allReturns.length
  const variance = allReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / allReturns.length
  const std = Math.sqrt(variance) + 1e-8
  const normalizedReturns = allReturns.map((g) => (g - mean) / std)

  nn.policyGradientUpdate(allObs, allActions, normalizedReturns, {
    clipGrad: config.clipGrad,
    lr: config.learningRate,
  })

  const avgReturn = totalReturn / trajectories.length
  return { avgReturn, bestScore }
}
