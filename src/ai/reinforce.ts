import { NeuralNetwork } from "@/nn/NeuralNetwork"
import { createGameState, step, getObservation } from "@/game/engine"
import type { Action } from "@/game/types"

const FIXED_DT = 1 / 60
const VIEW_WIDTH = 800

function createSeededRandom(seed: number): () => number {
  let s = seed
  return () => {
    let t = (s += 0x6d2b79f5) | 0
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface TrajectoryStep {
  obs: number[]
  action: Action
  logProb: number
  reward: number
  grounded: boolean
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
    const grounded = state.playerY <= 0
    const pJump = nn.predictOnly(obs)
    const action: Action = grounded && obs[0] <= OBS_PROXIMITY && pJump >= threshold ? 1 : 0
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
  const rng = createSeededRandom(seed ^ 0xa5a5a5a5)

  while (!state.gameOver) {
    const obs = getObservation(state)
    const grounded = state.playerY <= 0
    const pJump = Math.max(1e-7, Math.min(1 - 1e-7, nn.predictOnly(obs)))
    const action: Action = grounded && obs[0] <= OBS_PROXIMITY && rng() < pJump ? 1 : 0
    const logProb =
      action * Math.log(pJump) + (1 - action) * Math.log(1 - pJump)

    const result = step(state, action, FIXED_DT)
    trajectory.push({ obs, action, logProb, reward: result.reward, grounded })
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
  const T = rewards.length
  const G = new Array<number>(T)
  let acc = 0
  for (let t = T - 1; t >= 0; t--) {
    acc = rewards[t] + gamma * acc
    G[t] = acc
  }
  if (!normalize || T === 0) return G
  let sum = 0
  for (let t = 0; t < T; t++) sum += G[t]
  const mean = sum / T
  let varSum = 0
  for (let t = 0; t < T; t++) varSum += (G[t] - mean) ** 2
  const std = Math.sqrt(varSum / T) + 1e-8
  for (let t = 0; t < T; t++) G[t] = (G[t] - mean) / std
  return G
}

export interface ReinforceConfig {
  gamma: number
  learningRate: number
  clipGrad: number
  episodesPerUpdate: number
  entropyCoef: number
}

// Agent can only consider jumping when obstacle is within actionable range.
// 0.5 * 720 = 360px ≈ 1.5 jump distances. Wide enough for meaningful
// timing variation so the network can learn WHEN to jump, not just IF.
const OBS_PROXIMITY = 0.5

/**
 * Train one REINFORCE update with Monte Carlo returns.
 * Collects episodes, computes discounted returns, normalizes, then does policy gradient.
 * Gate in runEpisode ensures the agent only jumps within OBS_PROXIMITY;
 * policy gradient uses grounded steps inside the gate only (see loop below).
 */
export function reinforceUpdate(
  nn: NeuralNetwork,
  config: ReinforceConfig,
  seedBase: number,
  onEpisode?: (result: EpisodeResult) => void,
  shouldStop?: () => boolean,
): { avgReturn: number; bestScore: number; totalSteps: number } {
  const allObs: number[][] = []
  const allActions: number[] = []
  const allAdvantages: number[] = []
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
      const s = trajectory[t]
      // Only train on steps where the agent had a real decision:
      // grounded AND within the gate. Gate-blocked steps (obs[0] > OBS_PROXIMITY)
      // have forced action=0, so their gradient is biased.
      if (!s.grounded || s.obs[0] > OBS_PROXIMITY) continue
      allObs.push(s.obs)
      allActions.push(s.action)
      allAdvantages.push(returns[t])
    }

    totalReturn += trajectory.reduce((a, s) => a + s.reward, 0)
    bestScore = Math.max(bestScore, score)
    totalSteps += steps
  }

  if (allObs.length === 0) return { avgReturn: 0, bestScore, totalSteps }

  // Standardize returns: (G - mean) / (std + eps)
  const mean = allAdvantages.reduce((a, b) => a + b, 0) / allAdvantages.length
  const variance = allAdvantages.reduce((a, b) => a + (b - mean) ** 2, 0) / allAdvantages.length
  const std = Math.sqrt(variance) + 1e-8
  const normalizedAdvantages = allAdvantages.map((a) => (a - mean) / std)

  nn.policyGradientUpdate(allObs, allActions, normalizedAdvantages, {
    clipGrad: config.clipGrad,
    lr: config.learningRate,
    entropyCoef: config.entropyCoef,
  })

  const avgReturn = episodesRun > 0 ? totalReturn / episodesRun : 0
  return { avgReturn, bestScore, totalSteps }
}

/**
 * Policy update from pre-collected trajectories (e.g. from visual training).
 */
export function policyUpdateFromTrajectories(
  nn: NeuralNetwork,
  trajectories: TrajectoryStep[][],
  scores: number[],
  config: { gamma: number; learningRate: number; clipGrad: number; entropyCoef: number },
): { avgReturn: number; bestScore: number } {
  const allObs: number[][] = []
  const allActions: number[] = []
  const allAdvantages: number[] = []
  let totalReturn = 0
  let bestScore = 0

  for (let i = 0; i < trajectories.length; i++) {
    const trajectory = trajectories[i]
    const rewards = trajectory.map((s) => s.reward)
    const returns = computeReturns(rewards, config.gamma, false)
    for (let t = 0; t < trajectory.length; t++) {
      const s = trajectory[t]
      if (!s.grounded || s.obs[0] > OBS_PROXIMITY) continue
      allObs.push(s.obs)
      allActions.push(s.action)
      allAdvantages.push(returns[t])
    }

    totalReturn += trajectory.reduce((a, s) => a + s.reward, 0)
    bestScore = Math.max(bestScore, scores[i] ?? 0)
  }

  if (allObs.length === 0) return { avgReturn: totalReturn / Math.max(1, trajectories.length), bestScore }

  const mean = allAdvantages.reduce((a, b) => a + b, 0) / allAdvantages.length
  const variance = allAdvantages.reduce((a, b) => a + (b - mean) ** 2, 0) / allAdvantages.length
  const std = Math.sqrt(variance) + 1e-8
  const normalizedAdvantages = allAdvantages.map((a) => (a - mean) / std)

  nn.policyGradientUpdate(allObs, allActions, normalizedAdvantages, {
    clipGrad: config.clipGrad,
    lr: config.learningRate,
    entropyCoef: config.entropyCoef,
  })

  const avgReturn = totalReturn / trajectories.length
  return { avgReturn, bestScore }
}
