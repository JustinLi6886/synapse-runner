import { describe, expect, it } from 'vitest'
import { createGameState, step } from './engine'
import type { Action } from './types'

function replay(seed: number, actions: Action[]) {
  let state = createGameState(800, seed)
  for (const action of actions) {
    state = step(state, action, 1 / 60).state
  }
  return state
}

describe('game engine determinism', () => {
  it('replays the same action sequence identically for a fixed seed', () => {
    const actions = Array.from({ length: 360 }, (_, index): Action =>
      index % 47 === 0 ? 1 : 0,
    )

    expect(replay(2026, actions)).toEqual(replay(2026, actions))
  })

  it('uses the seed to vary obstacle generation', () => {
    const actions = Array.from({ length: 120 }, (): Action => 0)
    const first = replay(11, actions)
    const second = replay(12, actions)

    expect(first.nextSpawnGapPx).not.toBe(second.nextSpawnGapPx)
  })
})
