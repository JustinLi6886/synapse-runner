export interface NeuralNetworkConfig {
  layers: number[]
  learningRate: number
  seed?: number
  outputBias?: number
  outputActivation?: 'sigmoid' | 'linear'
}
