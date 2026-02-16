/** layers[0] = input, layers[L] = output, rest = hidden. */
export interface NeuralNetworkConfig {
  layers: number[]
  learningRate: number
  seed?: number
}
