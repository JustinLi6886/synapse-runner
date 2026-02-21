export interface Obstacle {
  id: number
  x: number
  width: number
  height: number
}

export type Action = 0 | 1

export interface GameState {
  seed: number
  viewWidth: number
  playerY: number
  playerVy: number
  obstacles: Obstacle[]
  spawnProgressPx: number
  nextSpawnGapPx: number
  distance: number
  pixelsTraveled: number
  gameOver: boolean
  gameSpeed: number
  nextObstacleId: number
  rngState: number
}

export interface StepResult {
  state: GameState
  reward: number
  done: boolean
  info: {
    obstaclePassed: boolean
    obstaclesPassed: number
    collision: boolean
    score: number
  }
}
