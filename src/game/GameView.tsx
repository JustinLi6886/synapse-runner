import { useRef, useEffect, useState, useCallback } from 'react'
import type { GameState } from './types'
import { createInitialState, step } from './engine'
import { draw } from './render'

export function GameView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<GameState>(createInitialState)
  const stateRef = useRef<GameState>(gameState)
  const jumpPressedRef = useRef(false)
  const lastTimeRef = useRef<number>(0)
  const frameCountRef = useRef(0)
  const accumulatorRef = useRef(0)
  const FIXED_DT = 1 / 60
  const MAX_ACC = 0.1

  stateRef.current = gameState

  const reset = useCallback(() => {
    if (import.meta.env.DEV) console.log('[game] reset')
    const init = createInitialState()
    stateRef.current = init
    setGameState(init)
    frameCountRef.current = 0
    accumulatorRef.current = 0
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (import.meta.env.DEV) console.log('[game] Space keydown')
        jumpPressedRef.current = true
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') jumpPressedRef.current = false
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    let rafId: number
    const loop = (now: number) => {
      const dtMs = lastTimeRef.current ? Math.min(now - lastTimeRef.current, 50) : 0
      lastTimeRef.current = now
      const dtSec = dtMs * 0.001
      accumulatorRef.current = Math.min(accumulatorRef.current + dtSec, MAX_ACC)
      const width = Math.max(1, canvas.width || 400)
      const height = Math.max(1, canvas.height || 300)
      let jumpPressed = jumpPressedRef.current
      if (jumpPressed) jumpPressedRef.current = false
      while (accumulatorRef.current >= FIXED_DT) {
        const s = stateRef.current
        const next = step(s, FIXED_DT, jumpPressed, width, height)
        jumpPressed = false
        stateRef.current = next
        accumulatorRef.current -= FIXED_DT
      }
      const next = stateRef.current
      setGameState(next)
      const ctx = canvas.getContext('2d')
      if (ctx) draw(ctx, next, width, height)
      if (import.meta.env.DEV) {
        frameCountRef.current += 1
        if (frameCountRef.current % 60 === 0) {
          console.log('[game]', { playerY: next.playerY.toFixed(1), playerVy: next.playerVy.toFixed(0), obstacles: next.obstacles.length, score: next.score })
        }
      }
      rafId = requestAnimationFrame(loop)
    }
    lastTimeRef.current = performance.now()
    rafId = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      cancelAnimationFrame(rafId)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const resize = () => {
      const w = parent.clientWidth
      const h = parent.clientHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      {gameState.gameOver && (
        <button
          type="button"
          onClick={reset}
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 20px',
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      )}
    </div>
  )
}
