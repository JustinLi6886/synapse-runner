export interface Obstacle {
  x: number
  width: number
  height: number
}

export interface Cloud {
  x: number
  y: number
  r: number
}

export interface GameState {
  playerY: number
  playerVy: number
  obstacles: Obstacle[]
  clouds: Cloud[]
  clearedCount: number
  score: number
  gameOver: boolean
  gameSpeed: number
  spawnTimer: number
  cloudTimer: number
  time: number
}

/** Single config: sizes, physics, and spawn (per-frame at 60 FPS). */
export const GAME_CONFIG = {
  groundY: 93,
  playerX: 80,
  playerWidth: 24,
  playerHeight: 40,
  obstacleMinWidth: 16,
  obstacleMaxWidth: 36,
  obstacleMinHeight: 12,
  /** Max obstacle height; kept below jump apex so all obstacles are clearable. */
  obstacleMaxHeight: 55,
  hitboxPadding: 3,
  GRAVITY: 0.6,
  INITIAL_SPEED: 6,
  MAX_SPEED: 13,
  INITIAL_JUMP_VELOCITY: 12,
  ACCELERATION: 0.001,
  CLOUD_FREQUENCY: 0.5,
  MAX_CLOUDS: 6,
  SPAWN_INTERVAL_SEC: 1.2,
} as const

if (import.meta.env.DEV) {
  const c = GAME_CONFIG
  const maxJumpApex =
    (c.INITIAL_JUMP_VELOCITY * c.INITIAL_JUMP_VELOCITY) / (2 * c.GRAVITY)
  console.log(
    '[GAME_CONFIG] Player size:',
    c.playerWidth,
    '×',
    c.playerHeight,
    'px'
  )
  console.log(
    '[GAME_CONFIG] Obstacle size range: width',
    c.obstacleMinWidth,
    '–',
    c.obstacleMaxWidth,
    'px, height',
    c.obstacleMinHeight,
    '–',
    c.obstacleMaxHeight,
    'px'
  )
  console.log(
    '[GAME_CONFIG] obstacleMaxHeight is jumpable: jump apex =',
    maxJumpApex.toFixed(0),
    'px (v²/2g). Player bottom clears obstacle top when obstacle height < apex;',
    c.obstacleMaxHeight,
    '<',
    maxJumpApex.toFixed(0),
    'with margin.'
  )
  console.log('[GAME_CONFIG] DEV: set window.__SHOW_HITBOXES__ = true to draw hitbox outlines.')
}
