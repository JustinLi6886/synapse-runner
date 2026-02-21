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
  distancePerSecond,
} = GAME_CONFIG

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
  let rngState = seed
  let gap: number
  ;[gap, rngState] = rngInRange(rngState, spawnGapPxMin, spawnGapPxMax)

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

export function reset(viewWidth: number, seed?: number): GameState {
  return createGameState(viewWidth, seed)
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

export function step(prev: GameState, action: Action, dt: number): StepResult {
  if (prev.gameOver) {
    return {
      state: prev,
      reward: 0,
      done: true,
      info: { obstaclePassed: false, obstaclesPassed: 0, collision: false, score: getScore(prev) },
    }
  }

  const viewWidth = prev.viewWidth
  let { playerY, playerVy, obstacles, spawnProgressPx, nextSpawnGapPx, distance, pixelsTraveled, nextObstacleId, rngState } = prev

  const score = Math.floor(distance)
  const steps = Math.floor(score / 75)
  const gameSpeed = Math.min(speedMax, speedStart + steps * 0.5)
  const movePx = baseMovePx * gameSpeed

  distance += distancePerSecond * dt * gameSpeed

  // g ∝ speed², v ∝ speed → constant jump height, airtime ∝ 1/speed
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

  let reward = 0.01 + obstaclesPassed * 1.0
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
      score: getScore(next),
    },
  }
}

// Returns [distToObs, obsWidth, obsHeight, playerY, playerVy, gameSpeed], all normalized to [0,1].
export function getObservation(state: GameState): number[] {
  const nextObs = state.obstacles
    .filter((o) => o.x + o.width > PLAYER_X)
    .sort((a, b) => a.x - b.x)[0] ?? null

  const maxDistance = Math.max(1, state.viewWidth - PLAYER_X)
  const dist = nextObs ? Math.max(0, nextObs.x - PLAYER_X) : maxDistance
  const width = nextObs?.width ?? 0
  const height = nextObs?.height ?? 0

  const maxJumpHeight = (jumpVelocity * jumpVelocity) / (2 * gravity)
  const maxVel = jumpVelocity * Math.max(1, state.gameSpeed)
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

  return [
    clamp01(dist / maxDistance),
    clamp01(width / obstacleWMax),
    clamp01(height / obstacleHMax),
    clamp01(state.playerY / maxJumpHeight),
    clamp01((state.playerVy + maxVel) / (2 * maxVel)),
    clamp01(state.gameSpeed / speedMax),
  ]
}

export function isDone(state: GameState): boolean {
  return state.gameOver
}

export function getScore(state: GameState): number {
  return Math.floor(state.distance)
}
