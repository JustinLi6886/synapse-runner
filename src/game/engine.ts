import type { GameState, Obstacle, Action, StepResult } from "./types"
import { GAME_CONFIG } from "./config"

const {
  gravity,
  jumpVelocity,
  playerX: PLAYER_X,
  playerW: PLAYER_W,
  playerHitboxH,
  playerHitboxBottomOffset,
  spawnGapPxMin,
  spawnGapPxMax,
  obstacleWMin,
  obstacleWMax,
  obstacleHMin,
  obstacleHMax,
  baseMovePx,
  speedStart,
  speedMax,
  speedAccel,
  distancePerSecond,
} = GAME_CONFIG

const MAX_JUMP_HEIGHT = (jumpVelocity * jumpVelocity) / (2 * gravity)

function nextRng(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) | 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}

function rngInRange(state: number, min: number, max: number): [number, number] {
  const [val, next] = nextRng(state)
  return [min + val * (max - min), next]
}

export function createGameState(viewWidth: number, seed: number = 42): GameState {
  const [gap, rngState] = rngInRange(seed, spawnGapPxMin, spawnGapPxMax)

  return {
    seed,
    viewWidth,
    playerY: 0,
    playerVy: 0,
    obstacles: [],
    spawnProgressPx: 0,
    nextSpawnGapPx: gap,
    distance: 0,
    pixelsTraveled: 0,
    gameOver: false,
    gameSpeed: speedStart,
    nextObstacleId: 0,
    rngState,
  }
}

function checkCollision(state: GameState): boolean {
  const playerLeft = PLAYER_X
  const playerRight = PLAYER_X + PLAYER_W
  const playerBottom = state.playerY + playerHitboxBottomOffset
  const playerTop = playerBottom + playerHitboxH

  const EPS = 1
  for (const o of state.obstacles) {
    const obsLeft = o.x
    const obsRight = o.x + o.width
    const obsBottom = 0
    const obsTop = o.height

    const overlapX = (playerRight + EPS) > obsLeft && playerLeft < (obsRight + EPS)
    const overlapY = playerTop > obsBottom && playerBottom < obsTop

    if (overlapX && overlapY) return true
  }

  return false
}

function nearestObstacleAhead(state: GameState): Obstacle | null {
  let nextObs: Obstacle | null = null
  let bestX = Infinity
  for (let i = 0; i < state.obstacles.length; i++) {
    const o = state.obstacles[i]
    if (o.x + o.width > PLAYER_X && o.x < bestX) {
      bestX = o.x
      nextObs = o
    }
  }
  return nextObs
}

export function step(prev: GameState, action: Action, dt: number): StepResult {
  if (prev.gameOver) {
    return {
      state: prev,
      reward: 0,
      done: true,
      info: { obstaclePassed: false, obstaclesPassed: 0, collision: false, score: floorScore(prev) },
    }
  }

  const viewWidth = prev.viewWidth
  let { playerY, playerVy, obstacles, spawnProgressPx, nextSpawnGapPx, distance, pixelsTraveled, nextObstacleId, rngState } = prev

  const gameSpeed = Math.min(speedMax, speedStart + distance * speedAccel)
  const movePx = baseMovePx * gameSpeed

  distance += distancePerSecond * dt * gameSpeed

  const g = gravity * gameSpeed * gameSpeed
  const jumpV = jumpVelocity * gameSpeed

  if (playerY <= 0 && action === 1) {
    playerVy = jumpV
  }
  playerVy -= g
  playerY += playerVy
  if (playerY < 0) {
    playerY = 0
    playerVy = 0
  }

  pixelsTraveled += movePx

  let obstaclesPassed = 0
  for (const o of obstacles) {
    const rightEdge = o.x + o.width
    if (rightEdge > PLAYER_X && rightEdge - movePx <= PLAYER_X) {
      obstaclesPassed++
    }
  }

  spawnProgressPx += movePx
  while (spawnProgressPx >= nextSpawnGapPx) {
    spawnProgressPx -= nextSpawnGapPx
    let width: number, height: number
    ;[width, rngState] = rngInRange(rngState, obstacleWMin, obstacleWMax)
    ;[height, rngState] = rngInRange(rngState, obstacleHMin, obstacleHMax)
    const obstacle: Obstacle = {
      id: nextObstacleId,
      x: viewWidth,
      width,
      height,
    }
    nextObstacleId += 1
    obstacles = [...obstacles, obstacle]
    ;[nextSpawnGapPx, rngState] = rngInRange(rngState, spawnGapPxMin, spawnGapPxMax)
  }

  obstacles = obstacles
    .map((o) => ({ ...o, x: o.x - movePx }))
    .filter((o) => o.x + o.width > 0)

  const next: GameState = {
    ...prev,
    playerY,
    playerVy,
    obstacles,
    spawnProgressPx,
    nextSpawnGapPx,
    distance,
    pixelsTraveled,
    gameSpeed,
    nextObstacleId,
    rngState,
  }

  const nextAhead = nearestObstacleAhead(prev)
  const maxDist0 = Math.max(1, prev.viewWidth - PLAYER_X)
  const h = nextAhead?.height ?? 0
  const clearance01 = Math.max(0, Math.min(1, h / MAX_JUMP_HEIGHT))
  const distPx = nextAhead ? Math.max(0, nextAhead.x - PLAYER_X) : maxDist0
  const dist01 = Math.max(0, Math.min(1, distPx / maxDist0))
  const jumped = action === 1 && prev.playerY <= 0
  let reward = 0.01 + obstaclesPassed * 5.0 + (gameSpeed - speedStart) * 0.002
  const JUMP_COST_BASE = 0.85
  const JUMP_EXTRA_LOW_CLEARANCE = 0.38
  const JUMP_EXTRA_EARLY = 0.62
  if (jumped) {
    reward -= JUMP_COST_BASE
    reward -= JUMP_EXTRA_LOW_CLEARANCE * (1 - clearance01)
    reward -= JUMP_EXTRA_EARLY * dist01 * dist01
  }
  const IDLE_CLEAR_MAX = 0.22
  const IDLE_BONUS = 0.018
  if (prev.playerY <= 0 && !jumped && clearance01 < IDLE_CLEAR_MAX) {
    reward += IDLE_BONUS
  }
  let collision = false

  if (checkCollision(next)) {
    next.gameOver = true
    reward = -5
    collision = true
  }

  return {
    state: next,
    reward,
    done: next.gameOver,
    info: {
      obstaclePassed: obstaclesPassed > 0,
      obstaclesPassed,
      collision,
      score: floorScore(next),
    },
  }
}

export function getObservation(state: GameState): number[] {
  const nextObs = nearestObstacleAhead(state)
  const maxDistance = Math.max(1, state.viewWidth - PLAYER_X)
  const dist = nextObs ? Math.max(0, nextObs.x - PLAYER_X) : maxDistance
  const width = nextObs?.width ?? 0
  const height = nextObs?.height ?? 0

  const maxVel = jumpVelocity * Math.max(1, state.gameSpeed)
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

  return [
    clamp01(dist / maxDistance),
    clamp01(width / obstacleWMax),
    clamp01(height / obstacleHMax),
    clamp01(state.playerY / MAX_JUMP_HEIGHT),
    clamp01((state.playerVy + maxVel) / (2 * maxVel)),
    clamp01(state.gameSpeed / speedMax),
    clamp01(height / MAX_JUMP_HEIGHT),
  ]
}

function floorScore(state: GameState): number {
  return Math.floor(state.distance)
}
