import type { GameState } from './types'
import { GAME_CONFIG } from './types'

const {
  groundY: GROUND_Y,
  playerX,
  playerWidth,
  playerHeight,
  hitboxPadding,
} = GAME_CONFIG

declare global {
  interface Window {
    __SHOW_HITBOXES__?: boolean
  }
}

export function draw(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number
): void {
  const g = GROUND_Y

  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#333'
  ctx.fillRect(0, g, width, height - g)

  ctx.fillStyle = '#4ade80'
  ctx.fillRect(playerX, state.playerY, playerWidth, playerHeight)

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  for (const c of state.clouds) {
    ctx.beginPath()
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#f87171'
  for (const o of state.obstacles) {
    ctx.fillRect(o.x, g - o.height, o.width, o.height)
  }

  if (import.meta.env.DEV && window.__SHOW_HITBOXES__) {
    const p = hitboxPadding
    ctx.strokeStyle = 'lime'
    ctx.lineWidth = 1
    ctx.strokeRect(
      playerX + p,
      state.playerY + p,
      playerWidth - 2 * p,
      playerHeight - 2 * p
    )
    ctx.strokeStyle = 'orange'
    for (const o of state.obstacles) {
      ctx.strokeRect(o.x + p, g - o.height + p, o.width - 2 * p, o.height - 2 * p)
    }
  }

  ctx.fillStyle = '#e5e5e5'
  ctx.font = '16px system-ui'
  ctx.fillText(`Score: ${state.score}`, 12, 24)

  if (state.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#fff'
    ctx.font = '24px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Game Over', width / 2, height / 2 - 12)
    ctx.fillText(`Score: ${state.score}`, width / 2, height / 2 + 16)
    ctx.textAlign = 'left'
  }
}
