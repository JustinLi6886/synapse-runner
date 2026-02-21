export const mockState = {
  activeMode: "human" as string,
  isHeadless: false,
  seed: 42,

  metrics: {
    score: 312,
    bestScore: 427,
    episode: 84,
    totalEpisodes: 100,
    speed: 6.2,
    jumpProb: 0.73,
    action: "JUMP",
  },

  run: {
    id: "r-4f8a2",
    duration: "12m 34s",
    fps: 60,
    params: "12.4K",
    distance: "1,247m",
  },

  training: {
    imitation: {
      epochs: 50,
      learningRate: "0.001",
      threshold: 0.5,
    },
    policyGradient: {
      gamma: 0.99,
      learningRate: 0.001,
      entropyRegEnabled: true,
      bestScore: 427,
    },
    evolution: {
      populationSize: 64,
      eliteCount: 8,
      mutationSigma: 0.1,
      generation: 142,
    },
  },

  observations: [
    { label: "Distance to Obstacle", value: 234, max: 600 },
    { label: "Obstacle Width", value: 42, max: 100 },
    { label: "Obstacle Height", value: 56, max: 100 },
    { label: "Player Y", value: 0, max: 200 },
    { label: "Player Velocity", value: -2.4, max: 10 },
    { label: "Game Speed", value: 6.2, max: 12 },
  ],
}

export const lossData = Array.from({ length: 20 }, (_, i) => ({
  name: `${i + 1}`,
  value: Number(
    Math.max(0.05, 2.4 * Math.exp(-0.15 * i) + (Math.random() * 0.1)).toFixed(3)
  ),
}))

export const returnData = Array.from({ length: 25 }, (_, i) => ({
  name: `${i + 1}`,
  value: Number(
    Math.min(450, 20 + i * 16 + (Math.random() * 30 - 15)).toFixed(1)
  ),
}))

export const fitnessData = Array.from({ length: 15 }, (_, i) => ({
  name: `${i + 1}`,
  value: Number(
    Math.min(380, 10 + i * 22 + (Math.random() * 20 - 10)).toFixed(1)
  ),
}))

export type MockState = typeof mockState
