import type { GameState, Action } from "@/game/types"

export interface Controller {
  decideAction(state: GameState, obs: number[]): Action
  getLastLogProb?(): number
  onEpisodeEnd?(stats: { score: number; steps: number }): void
  reset?(): void
}

export class HumanController implements Controller {
  private jumpPressed = false

  setJumpPressed(v: boolean): void {
    if (v) this.jumpPressed = true
  }

  decideAction(state: GameState, _obs: number[]): Action {
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

  constructor(predict: (obs: number[]) => number, threshold = 0.5) {
    this.predict = predict
    this.threshold = threshold
  }

  setThreshold(t: number): void {
    this.threshold = t
  }

  decideAction(_state: GameState, obs: number[]): Action {
    const pJump = this.predict(obs)
    return pJump >= this.threshold ? 1 : 0
  }

  reset(): void {}
}

/** Samples action from Bernoulli(pJump) for RL training. Call getLastLogProb() after decideAction. */
export class SamplingModelController implements Controller {
  private predict: (obs: number[]) => number
  private lastLogProb = 0

  constructor(predict: (obs: number[]) => number) {
    this.predict = predict
  }

  getLastLogProb(): number {
    return this.lastLogProb
  }

  decideAction(_state: GameState, obs: number[]): Action {
    const pJump = Math.max(1e-8, Math.min(1 - 1e-8, this.predict(obs)))
    const action: Action = Math.random() < pJump ? 1 : 0
    this.lastLogProb = action * Math.log(pJump) + (1 - action) * Math.log(1 - pJump)
    return action
  }

  reset(): void {}
}
