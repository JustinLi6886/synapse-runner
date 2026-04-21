import { NeuralNetwork } from "@/nn/NeuralNetwork"
import { sigmoid } from "@/nn/activations"
import { createGameState, step, getObservation } from "@/game/engine"
import { SIM_VIEW_WIDTH } from "@/game/config"
import type { Action } from "@/game/types"

const FIXED_DT = 1 / 60

export const PG_INPUT_DIM = 7

export const PG_LAYERS_ACTOR = [PG_INPUT_DIM, 32, 16, 1] as const
export const PG_LAYERS_CRITIC = [PG_INPUT_DIM, 32, 16, 1] as const

export const DEFAULT_PG_VIEW_WIDTH = SIM_VIEW_WIDTH

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
  reward: number
  grounded: boolean
}

interface EpisodeRollout {
  trajectory: TrajectoryStep[]
  score: number
  steps: number
}

function discountedReturns(rewards: number[], gamma: number): number[] {
  const T = rewards.length
  const G = new Array<number>(T)
  let acc = 0
  for (let t = T - 1; t >= 0; t--) {
    acc = rewards[t] + gamma * acc
    G[t] = acc
  }
  return G
}

function gaeAdvantages(
  traj: TrajectoryStep[],
  critic: NeuralNetwork,
  gamma: number,
  lambda: number,
): number[] {
  const T = traj.length
  if (T === 0) return []
  const V = new Array<number>(T)
  for (let t = 0; t < T; t++) V[t] = critic.forward(traj[t].obs)[0]

  const delta = new Array<number>(T)
  for (let t = 0; t < T; t++) {
    const vNext = t + 1 < T ? V[t + 1] : 0
    delta[t] = traj[t].reward + gamma * vNext - V[t]
  }

  const adv = new Array<number>(T)
  let acc = 0
  for (let t = T - 1; t >= 0; t--) {
    acc = delta[t] + gamma * lambda * acc
    adv[t] = acc
  }
  return adv
}

export function rolloutTemperedJumpProb(actor: NeuralNetwork, obs: number[], temperature: number): number {
  const T = Math.max(0.15, temperature)
  const zc = actor.predictLastLogitClamped(obs)
  return Math.max(1e-7, Math.min(1 - 1e-7, sigmoid(zc / T)))
}

function runEpisodeStochastic(
  actor: NeuralNetwork,
  seed: number,
  viewWidth: number = DEFAULT_PG_VIEW_WIDTH,
  rolloutSamplingTemperature: number = 1,
): EpisodeRollout {
  const trajectory: TrajectoryStep[] = []
  let state = createGameState(viewWidth, seed)
  const rng = createSeededRandom(seed ^ 0xa5a5a5a5)
  const T = Math.max(0.15, rolloutSamplingTemperature)

  while (!state.gameOver) {
    const obs = getObservation(state)
    const grounded = state.playerY <= 0
    let action: Action = 0
    if (grounded) {
      const zc = actor.predictLastLogitClamped(obs)
      const pJump = Math.max(1e-7, Math.min(1 - 1e-7, sigmoid(zc / T)))
      action = rng() < pJump ? 1 : 0
    }
    const result = step(state, action, FIXED_DT)
    trajectory.push({ obs, action, reward: result.reward, grounded })
    state = result.state
  }

  return {
    trajectory,
    score: Math.floor(state.distance),
    steps: trajectory.length,
  }
}

export function spreadEvalProbTowardHalf(p: number, spread: number): number {
  if (spread <= 1 || !Number.isFinite(spread)) return p
  const pc = Math.max(0, Math.min(1, p))
  const out = 0.5 + (pc - 0.5) / spread
  return Math.max(1e-6, Math.min(1 - 1e-6, out))
}

function runEpisodeGreedyScore(
  actor: NeuralNetwork,
  seed: number,
  threshold: number,
  viewWidth: number = DEFAULT_PG_VIEW_WIDTH,
  evalSpread: number = 1,
): { score: number; steps: number } {
  let state = createGameState(viewWidth, seed)
  let steps = 0
  while (!state.gameOver) {
    const obs = getObservation(state)
    const grounded = state.playerY <= 0
    const pRaw = actor.predictOnly(obs)
    const pJump = spreadEvalProbTowardHalf(pRaw, evalSpread)
    const action: Action = grounded && pJump >= threshold ? 1 : 0
    state = step(state, action, FIXED_DT).state
    steps++
  }
  return { score: Math.floor(state.distance), steps }
}

const GREEDY_EVAL_EPISODES = 12

function greedyEvalEpisodeSeeds(policyUpdateOrdinal: number, nEpisodes: number): number[] {
  const out: number[] = []
  for (let i = 0; i < nEpisodes; i++) {
    const x = (policyUpdateOrdinal * 1_000_003 + i * 1_000_033 + 0x9e3779b1) >>> 0
    out.push(x)
  }
  return out
}

function meanGreedyEvalScore(
  actor: NeuralNetwork,
  threshold: number,
  policyUpdateOrdinal: number,
  nEpisodes: number = GREEDY_EVAL_EPISODES,
  viewWidth: number = DEFAULT_PG_VIEW_WIDTH,
  evalSpread: number = 1,
): number {
  const seeds = greedyEvalEpisodeSeeds(policyUpdateOrdinal, nEpisodes)
  let s = 0
  for (let i = 0; i < nEpisodes; i++) {
    s += runEpisodeGreedyScore(actor, seeds[i], threshold, viewWidth, evalSpread).score
  }
  return s / nEpisodes
}

const GREEDY_THRESHOLD_CANDIDATES = [
  0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.88, 0.92, 0.96, 0.97, 0.98, 0.99,
] as const

const GREEDY_TAU_TIE_SCORE_ABS = 2.5
const GREEDY_TAU_TIE_SCORE_REL = 0.025

function findBestGreedyThreshold(
  actor: NeuralNetwork,
  policyUpdateOrdinal: number,
  viewWidth: number = DEFAULT_PG_VIEW_WIDTH,
  evalSpread: number = 1,
): { meanScore: number; bestThreshold: number } {
  const rows: { tau: number; m: number }[] = []
  for (const tau of GREEDY_THRESHOLD_CANDIDATES) {
    rows.push({
      tau,
      m: meanGreedyEvalScore(
        actor,
        tau,
        policyUpdateOrdinal,
        GREEDY_EVAL_EPISODES,
        viewWidth,
        evalSpread,
      ),
    })
  }
  const maxM = Math.max(...rows.map((r) => r.m))
  const tol = Math.max(GREEDY_TAU_TIE_SCORE_ABS, GREEDY_TAU_TIE_SCORE_REL * Math.max(1, maxM))
  const nearBest = rows.filter((r) => r.m >= maxM - tol)
  const chosen = nearBest.reduce((a, b) => (b.tau > a.tau ? b : a))
  return { meanScore: chosen.m, bestThreshold: chosen.tau }
}

interface ActorCriticBatchConfig {
  gamma: number
  gaeLambda: number
  actorLr: number
  criticLr: number
  clipGrad: number
  entropyCoef: number
  entropyCoefFloor?: number
  entropyAnnealTotalUpdates?: number
  entropyAnnealRunStartOrdinal?: number
  policyUpdateOrdinal?: number
  rolloutSamplingTemperature?: number
}

function standardizeAdvantages(adv: number[]): number[] {
  const n = adv.length
  if (n === 0) return adv
  let sum = 0
  for (let i = 0; i < n; i++) sum += adv[i]
  const mean = sum / n
  let v = 0
  for (let i = 0; i < n; i++) v += (adv[i] - mean) ** 2
  const std = Math.sqrt(v / n) + 1e-8
  return adv.map((a) => (a - mean) / std)
}

function applyActorCriticBatch(
  actor: NeuralNetwork,
  critic: NeuralNetwork,
  episodes: EpisodeRollout[],
  config: ActorCriticBatchConfig,
): boolean {
  const obsC: number[][] = []
  const targets: number[][] = []
  const obsA: number[][] = []
  const actions: number[] = []
  const advRaw: number[] = []

  for (let e = 0; e < episodes.length; e++) {
    const traj = episodes[e].trajectory
    const rewards = traj.map((s) => s.reward)
    const G = discountedReturns(rewards, config.gamma)
    const gae = gaeAdvantages(traj, critic, config.gamma, config.gaeLambda)
    for (let t = 0; t < traj.length; t++) {
      const stepT = traj[t]
      obsC.push(stepT.obs)
      targets.push([G[t]])
      if (stepT.grounded) {
        const adv = gae[t]
        if (Number.isFinite(adv)) {
          obsA.push(stepT.obs)
          actions.push(stepT.action)
          advRaw.push(adv)
        }
      }
    }
  }

  if (obsC.length === 0) return false

  critic.trainMSE(obsC, targets, config.criticLr)
  critic.trainMSE(obsC, targets, config.criticLr * 0.35)

  if (obsA.length === 0) return true

  const advantages = standardizeAdvantages(advRaw)
  let entropyEff = config.entropyCoef
  if (
    config.policyUpdateOrdinal != null &&
    config.entropyAnnealTotalUpdates != null &&
    config.entropyCoefFloor != null &&
    config.entropyAnnealRunStartOrdinal != null
  ) {
    const stepInRun = config.policyUpdateOrdinal - config.entropyAnnealRunStartOrdinal
    const total = Math.max(1, config.entropyAnnealTotalUpdates)
    const denom = Math.max(1, total - 1)
    const t = total <= 1 ? 1 : Math.min(1, Math.max(0, (stepInRun - 1) / denom))
    entropyEff = config.entropyCoefFloor + (config.entropyCoef - config.entropyCoefFloor) * (1 - t)
  }
  actor.policyGradientUpdate(obsA, actions, advantages, {
    clipGrad: config.clipGrad,
    lr: config.actorLr,
    entropyCoef: entropyEff,
    samplingTemperature: config.rolloutSamplingTemperature ?? 1,
  })
  return true
}

interface ActorCriticMinibatchConfig extends ActorCriticBatchConfig {
  episodesPerUpdate: number
  policyUpdateOrdinal: number
  greedyEvalThreshold: number
  greedyThresholdAuto: boolean
  evalLogitTemperature: number
}

interface ActorCriticMinibatchResult {
  avgEpisodeScore: number
  bestScore: number
  greedyMeanScore: number | null
  greedyEvalThresholdUsed: number | null
  totalSteps: number
  completed: boolean
  appliedStep: boolean
}

export function actorCriticMinibatchUpdate(
  actor: NeuralNetwork,
  critic: NeuralNetwork,
  config: ActorCriticMinibatchConfig,
  seedBase: number,
  viewWidth: number = DEFAULT_PG_VIEW_WIDTH,
  shouldStop?: () => boolean,
): ActorCriticMinibatchResult {
  const episodesPerUpdate = Math.max(1, Math.floor(Number(config.episodesPerUpdate)) || 1)
  const episodes: EpisodeRollout[] = []
  let episodesRun = 0
  let totalSteps = 0
  let bestScore = 0
  let totalScore = 0

  for (let e = 0; e < episodesPerUpdate; e++) {
    if (shouldStop?.()) break
    const seed = seedBase + e * 10007
    const ep = runEpisodeStochastic(
      actor,
      seed,
      viewWidth,
      config.rolloutSamplingTemperature ?? 1,
    )
    episodes.push(ep)
    episodesRun++
    totalSteps += ep.steps
    bestScore = Math.max(bestScore, ep.score)
    totalScore += ep.score
  }

  if (episodesRun < episodesPerUpdate) {
    return {
      avgEpisodeScore: 0,
      bestScore,
      greedyMeanScore: null,
      greedyEvalThresholdUsed: null,
      totalSteps,
      completed: false,
      appliedStep: false,
    }
  }

  const applied = applyActorCriticBatch(actor, critic, episodes, config)
  const avgEpisodeScore = episodesRun > 0 ? totalScore / episodesRun : 0
  let greedyMeanScore: number | null = null
  let greedyEvalThresholdUsed: number | null = null
  if (applied) {
    const ord = config.policyUpdateOrdinal
    const logitT = config.evalLogitTemperature
    if (config.greedyThresholdAuto) {
      const { meanScore, bestThreshold } = findBestGreedyThreshold(actor, ord, viewWidth, logitT)
      greedyMeanScore = meanScore
      greedyEvalThresholdUsed = bestThreshold
    } else {
      greedyEvalThresholdUsed = config.greedyEvalThreshold
      greedyMeanScore = meanGreedyEvalScore(
        actor,
        config.greedyEvalThreshold,
        ord,
        GREEDY_EVAL_EPISODES,
        viewWidth,
        logitT,
      )
    }
  }
  return {
    avgEpisodeScore,
    bestScore,
    greedyMeanScore,
    greedyEvalThresholdUsed,
    totalSteps,
    completed: true,
    appliedStep: applied,
  }
}

export function actorCriticUpdateFromTrajectories(
  actor: NeuralNetwork,
  critic: NeuralNetwork,
  trajectories: TrajectoryStep[][],
  scores: number[],
  config: ActorCriticBatchConfig,
  greedyEvalThreshold: number,
  greedyThresholdAuto: boolean,
  evalLogitTemperature: number,
): {
  avgEpisodeScore: number
  bestScore: number
  greedyMeanScore: number | null
  greedyEvalThresholdUsed: number | null
  appliedStep: boolean
} {
  const episodes: EpisodeRollout[] = trajectories.map((trajectory, i) => ({
    trajectory,
    score: scores[i] ?? 0,
    steps: trajectory.length,
  }))
  let totalScore = 0
  let bestScore = 0
  for (let i = 0; i < episodes.length; i++) {
    totalScore += scores[i] ?? 0
    bestScore = Math.max(bestScore, scores[i] ?? 0)
  }
  const applied = applyActorCriticBatch(actor, critic, episodes, config)
  const avgEpisodeScore = episodes.length > 0 ? totalScore / episodes.length : 0
  const ord = config.policyUpdateOrdinal ?? 1
  let greedyMeanScore: number | null = null
  let greedyEvalThresholdUsed: number | null = null
  if (applied) {
    if (greedyThresholdAuto) {
      const { meanScore, bestThreshold } = findBestGreedyThreshold(
        actor,
        ord,
        DEFAULT_PG_VIEW_WIDTH,
        evalLogitTemperature,
      )
      greedyMeanScore = meanScore
      greedyEvalThresholdUsed = bestThreshold
    } else {
      greedyEvalThresholdUsed = greedyEvalThreshold
      greedyMeanScore = meanGreedyEvalScore(
        actor,
        greedyEvalThreshold,
        ord,
        GREEDY_EVAL_EPISODES,
        DEFAULT_PG_VIEW_WIDTH,
        evalLogitTemperature,
      )
    }
  }
  return { avgEpisodeScore, bestScore, greedyMeanScore, greedyEvalThresholdUsed, appliedStep: applied }
}
