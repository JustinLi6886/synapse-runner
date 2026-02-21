import { useRef, useState, useCallback, useEffect } from "react"
import { createGameState, step, getObservation } from "@/game/engine"
import type { GameState, Action } from "@/game/types"
import type { Controller } from "@/ai/controller"

const FIXED_DT = 1 / 60
const MAX_ACCUM = 0.1

export interface UseGameRunnerOptions {
  controller: Controller
  paused: boolean
  viewWidth?: number
  started?: boolean
}

export function useGameRunner({ controller, paused, viewWidth = 800, started = true }: UseGameRunnerOptions) {
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

  useEffect(() => { viewWidthRef.current = viewWidth }, [viewWidth])
  useEffect(() => { controllerRef.current = controller }, [controller])

  const reset = useCallback(() => {
    const w = viewWidthRef.current
    const next = createGameState(w, Date.now())
    stateRef.current = next
    setState(next)
    accumRef.current = 0
    stepCountRef.current = 0
    episodeEndFiredRef.current = false
    controllerRef.current.reset?.()
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
        setState(current)
        rafId = requestAnimationFrame(loop)
        return
      }

      const dtMs = lastTimeRef.current ? Math.min(now - lastTimeRef.current, 50) : 0
      lastTimeRef.current = now
      const dtSec = dtMs / 1000
      accumRef.current = Math.min(accumRef.current + dtSec, MAX_ACCUM)

      const obs = getObservation(current)
      const action: Action = controllerRef.current.decideAction(current, obs)

      while (accumRef.current >= FIXED_DT) {
        const result = step(current, action, FIXED_DT)
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
