import type { GameState, Action } from "@/game/types"

export interface Controller {
  decideAction(state: GameState, obs: number[]): Action
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
    return pJump > this.threshold ? 1 : 0
  }

  reset(): void {}
}
