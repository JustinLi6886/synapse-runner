import type { GameState, Obstacle, Cloud } from './types'
import { GAME_CONFIG } from './types'

const {
  groundY: GROUND_Y,
  playerX: PLAYER_X,
  playerWidth: PLAYER_WIDTH,
  playerHeight: PLAYER_HEIGHT,
  obstacleMinWidth,
  obstacleMaxWidth,
  obstacleMinHeight,
  obstacleMaxHeight,
  hitboxPadding,
  GRAVITY,
  INITIAL_SPEED,
  MAX_SPEED,
  INITIAL_JUMP_VELOCITY,
  ACCELERATION,
  CLOUD_FREQUENCY,
  MAX_CLOUDS,
  SPAWN_INTERVAL_SEC,
} = GAME_CONFIG

export function createInitialState(): GameState {
  return {
    playerY: GROUND_Y - PLAYER_HEIGHT,
    playerVy: 0,
    obstacles: [],
    clouds: [],
    clearedCount: 0,
    score: 0,
    gameOver: false,
    gameSpeed: INITIAL_SPEED,
    spawnTimer: 0,
    cloudTimer: 0,
    time: 0,
  }
}

function groundY(): number {
  return GROUND_Y
}

function spawnObstacle(canvasWidth: number): Obstacle {
  const width =
    obstacleMinWidth +
    Math.random() * (obstacleMaxWidth - obstacleMinWidth)
  const height =
    obstacleMinHeight +
    Math.random() * (obstacleMaxHeight - obstacleMinHeight)
  return {
    x: canvasWidth + width,
    width,
    height,
  }
}

function spawnCloud(canvasWidth: number, groundY: number): Cloud {
  return {
    x: canvasWidth + 20 + Math.random() * 40,
    y: Math.random() * (groundY - 40),
    r: 12 + Math.random() * 16,
  }
}

function checkCollision(state: GameState): boolean {
  const g = groundY()
  const p = hitboxPadding
  const pLeft = PLAYER_X + p
  const pRight = PLAYER_X + PLAYER_WIDTH - p
  const pTop = state.playerY + p
  const pBottom = state.playerY + PLAYER_HEIGHT - p

  for (const o of state.obstacles) {
    const oTop = g - o.height
    const oLeft = o.x + p
    const oRight = o.x + o.width - p
    const oBottom = g - p
    if (
      pRight > oLeft &&
      pLeft < oRight &&
      pBottom > oTop &&
      pTop < oBottom
    ) {
      return true
    }
  }
  return false
}

/** Per-frame update (60 FPS). dt in seconds for spawn/timers only. */
export function step(
  state: GameState,
  dt: number,
  jumpPressed: boolean,
  canvasWidth: number,
  _canvasHeight: number
): GameState {
  if (state.gameOver) return state

  const g = groundY()
  let { playerY, playerVy, obstacles, clouds, clearedCount, gameSpeed, spawnTimer, cloudTimer, time } =
    state

  time += dt
  spawnTimer += dt
  if (spawnTimer >= SPAWN_INTERVAL_SEC) {
    spawnTimer = 0
    obstacles = [...obstacles, spawnObstacle(canvasWidth)]
    if (import.meta.env.DEV) console.log('[game] spawn obstacle', obstacles.length)
  }

  cloudTimer += dt
  if (clouds.length < MAX_CLOUDS && cloudTimer >= CLOUD_FREQUENCY) {
    cloudTimer = 0
    clouds = [...clouds, spawnCloud(canvasWidth, g)]
  }

  const movePx = gameSpeed
  const moved = obstacles.map((o) => ({ ...o, x: o.x - movePx }))
  const justCleared = moved.filter((o) => o.x + o.width <= 0).length
  clearedCount += justCleared
  obstacles = moved.filter((o) => o.x + o.width > 0)
  clouds = clouds.map((c) => ({ ...c, x: c.x - movePx * 0.3 })).filter((c) => c.x + c.r > 0)

  const groundTop = g - PLAYER_HEIGHT
  if (playerY >= groundTop && jumpPressed) {
    playerVy = -INITIAL_JUMP_VELOCITY
  }
  playerVy += GRAVITY
  playerY += playerVy
  if (playerY > groundTop) {
    playerY = groundTop
    playerVy = 0
  }

  gameSpeed = Math.min(MAX_SPEED, gameSpeed + ACCELERATION)

  const next = {
    ...state,
    playerY,
    playerVy,
    obstacles,
    clouds,
    clearedCount,
    gameSpeed,
    spawnTimer,
    cloudTimer,
    time,
  }
  next.score = next.clearedCount
  if (checkCollision(next)) {
    next.gameOver = true
  }
  return next
}

/** Normalized vector for future NN input. */
export function getInputVector(
  state: GameState,
  canvasWidth: number,
  canvasHeight: number
): number[] {
  const next = state.obstacles
    .filter((o) => o.x > PLAYER_X)
    .sort((a, b) => a.x - b.x)[0]

  const distToNext = next ? (next.x - PLAYER_X) / canvasWidth : 1
  const obstacleHeight = next ? next.height / canvasHeight : 0
  const obstacleWidth = next ? next.width / canvasWidth : 0
  const heightAboveGround = Math.max(0, GROUND_Y - state.playerY - PLAYER_HEIGHT)
  const maxJumpHeight = (INITIAL_JUMP_VELOCITY * INITIAL_JUMP_VELOCITY) / (2 * GRAVITY)
  const playerYNorm = heightAboveGround / maxJumpHeight
  const playerVyNorm = Math.max(-1, Math.min(1, -state.playerVy / INITIAL_JUMP_VELOCITY))
  const speedNorm = state.gameSpeed / MAX_SPEED

  return [
    distToNext,
    obstacleHeight,
    obstacleWidth,
    playerYNorm,
    playerVyNorm,
    speedNorm,
  ]
}
