import type { GameState, Action } from "@/game/types"
import { spreadEvalProbTowardHalf } from "@/ai/actorCritic"

function createSeededRandom(seed: number): () => number {
  let s = seed
  return () => {
    let t = (s += 0x6d2b79f5) | 0
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Controller {
  decideAction(state: GameState, obs: number[]): Action
  getLastLogProb?(): number
  onEpisodeEnd?(stats: { score: number; steps: number }): void
  reset?(seed?: number): void
}

export class HumanController implements Controller {
  private jumpPressed = false

  setJumpPressed(v: boolean): void {
    if (v) this.jumpPressed = true
  }

  decideAction(state: GameState): Action {
    if (!this.jumpPressed) return 0
    if (state.playerY > 0 || state.playerVy > 0) {
      this.jumpPressed = false
    }
    return 1
  }

  reset(): void {
    this.jumpPressed = false
  }
}

export class ModelController implements Controller {
  private predict: (obs: number[]) => number
  private threshold: number
  private evalLogitTemperature: number

  constructor(
    predict: (obs: number[]) => number,
    threshold = 0.5,
    evalLogitTemperature = 1,
  ) {
    this.predict = predict
    this.threshold = threshold
    this.evalLogitTemperature = evalLogitTemperature
  }

  setThreshold(t: number): void {
    this.threshold = t
  }

  setEvalLogitTemperature(t: number): void {
    this.evalLogitTemperature = t
  }

  decideAction(state: GameState, obs: number[]): Action {
    const grounded = state.playerY <= 0
    if (!grounded) return 0
    const pRaw = this.predict(obs)
    const pJump = spreadEvalProbTowardHalf(pRaw, this.evalLogitTemperature)
    return pJump >= this.threshold ? 1 : 0
  }

  reset(): void {}
}

export class SamplingModelController implements Controller {
  private predict: (obs: number[]) => number
  private lastLogProb = 0
  private rng: () => number
  private episodeCounter: number

  constructor(predict: (obs: number[]) => number) {
    this.predict = predict
    this.episodeCounter = 42
    this.rng = createSeededRandom(42)
  }

  getLastLogProb(): number {
    return this.lastLogProb
  }

  decideAction(state: GameState, obs: number[]): Action {
    const grounded = state.playerY <= 0
    if (!grounded) {
      this.lastLogProb = 0
      return 0
    }
    const pJump = Math.max(1e-7, Math.min(1 - 1e-7, this.predict(obs)))
    const action: Action = this.rng() < pJump ? 1 : 0
    this.lastLogProb = action * Math.log(pJump) + (1 - action) * Math.log(1 - pJump)
    return action
  }

  reset(seed?: number): void {
    if (seed !== undefined) {
      this.rng = createSeededRandom(seed ^ 0xa5a5a5a5)
    } else {
      this.episodeCounter += 1
      this.rng = createSeededRandom(this.episodeCounter)
    }
  }
}
