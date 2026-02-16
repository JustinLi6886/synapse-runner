/**
 * NN config for constructor.
 * layers[0] = input size, layers[L] = output size, rest = hidden sizes.
 */
export interface NeuralNetworkConfig {
  layers: number[]
  learningRate: number
  seed?: number
}
