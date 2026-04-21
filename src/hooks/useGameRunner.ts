import { useRef, useState, useCallback, useEffect } from "react"
import { createGameState, step, getObservation } from "@/game/engine"
import { SIM_VIEW_WIDTH } from "@/game/config"
import type { GameState, Action } from "@/game/types"
import type { Controller } from "@/ai/controller"

const FIXED_DT = 1 / 60
const MAX_ACCUM = 0.1

interface UseGameRunnerOptions {
  controller: Controller
  paused: boolean
  viewWidth?: number
  started?: boolean
  simSpeed?: number
  onStep?: (obs: number[], action: Action, state: GameState) => void
  onStepComplete?: (obs: number[], action: Action, logProb: number, reward: number, grounded: boolean) => void
}

export function useGameRunner({
  controller,
  paused,
  viewWidth = SIM_VIEW_WIDTH,
  started = true,
  simSpeed = 1,
  onStep,
  onStepComplete,
}: UseGameRunnerOptions) {
  const [state, setState] = useState<GameState | null>(null)
  const [bestScore, setBestScore] = useState(0)
  const stateRef = useRef<GameState | null>(null)
  const accumRef = useRef(0)
  const lastTimeRef = useRef<number>(0)
  const viewWidthRef = useRef(viewWidth)
  const bestScoreRef = useRef(0)
  const controllerRef = useRef(controller)
  const stepCountRef = useRef(0)
  const episodeEndFiredRef = useRef(false)
  const onStepRef = useRef(onStep)
  const onStepCompleteRef = useRef(onStepComplete)
  const simSpeedRef = useRef(simSpeed)

  useEffect(() => { viewWidthRef.current = viewWidth }, [viewWidth])
  useEffect(() => { simSpeedRef.current = simSpeed }, [simSpeed])
  useEffect(() => { controllerRef.current = controller }, [controller])
  useEffect(() => { onStepRef.current = onStep }, [onStep])
  useEffect(() => { onStepCompleteRef.current = onStepComplete }, [onStepComplete])

  const reset = useCallback((seed?: number) => {
    const w = viewWidthRef.current
    const usedSeed = seed ?? Date.now()
    const next = createGameState(w, usedSeed)
    stateRef.current = next
    setState(next)
    accumRef.current = 0
    stepCountRef.current = 0
    episodeEndFiredRef.current = false
    controllerRef.current.reset?.(usedSeed)
  }, [])

  useEffect(() => {
    if (!stateRef.current) {
      const w = viewWidthRef.current
      const next = createGameState(w, Date.now())
      stateRef.current = next
      setState(next)
    }

    let rafId: number
    const loop = (now: number) => {
      let current = stateRef.current
      if (!current) {
        rafId = requestAnimationFrame(loop)
        return
      }

      if (paused || !started || current.gameOver) {
        if (current.gameOver && !episodeEndFiredRef.current) {
          episodeEndFiredRef.current = true
          controllerRef.current.onEpisodeEnd?.({
            score: Math.floor(current.distance),
            steps: stepCountRef.current,
          })
        }
        if (current.gameOver) {
          const s = Math.floor(current.distance)
          if (s > bestScoreRef.current) {
            bestScoreRef.current = s
            setBestScore(s)
          }
        }
        setState(current)
        rafId = requestAnimationFrame(loop)
        return
      }

      const dtMs = lastTimeRef.current ? Math.min(now - lastTimeRef.current, 50) : 0
      lastTimeRef.current = now
      const dtSec = (dtMs / 1000) * simSpeedRef.current
      accumRef.current = Math.min(accumRef.current + dtSec, MAX_ACCUM * Math.max(1, simSpeedRef.current))

      while (accumRef.current >= FIXED_DT) {
        const obs = getObservation(current)
        const grounded = current.playerY <= 0
        const action: Action = controllerRef.current.decideAction(current, obs)
        const logProb = controllerRef.current.getLastLogProb?.() ?? 0
        onStepRef.current?.(obs, action, current)

        const result = step(current, action, FIXED_DT)
        onStepCompleteRef.current?.(obs, action, logProb, result.reward, grounded)
        current = result.state
        stateRef.current = current
        accumRef.current -= FIXED_DT
        stepCountRef.current += 1
      }

      setState(current)
      const s = Math.floor(current.distance)
      if (s > bestScoreRef.current) {
        bestScoreRef.current = s
        setBestScore(s)
      }

      rafId = requestAnimationFrame(loop)
    }
    lastTimeRef.current = performance.now()
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [paused, started])

  const gameState = state ?? null
  const score = gameState ? Math.floor(gameState.distance) : 0
  const distance = gameState ? gameState.distance : 0
  const pixelsTraveled = gameState ? gameState.pixelsTraveled : 0
  const speed = gameState ? gameState.gameSpeed : 0
  const gameOver = gameState?.gameOver ?? false

  return {
    state: gameState,
    score,
    bestScore,
    distance,
    pixelsTraveled,
    speed,
    gameOver,
    reset,
    paused,
  }
}
