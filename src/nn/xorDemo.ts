/**
 * XOR sanity check: train a small MLP on XOR, log loss every 100 steps, print final predictions.
 * Run from browser console: runXorDemo()
 * (Attached to window when this module is loaded.)
 */

import { NeuralNetwork } from './NeuralNetwork'

const XOR_INPUTS: number[][] = [[0, 0], [0, 1], [1, 0], [1, 1]]
const XOR_TARGETS: number[][] = [[0], [1], [1], [0]]

export function runXorDemo(): void {
  const nn = new NeuralNetwork({
    layers: [2, 4, 1],
    learningRate: 0.5,
    seed: 123,
  })

  const steps = 4000
  const logEvery = 100

  console.log('Training XOR for', steps, 'steps (loss every', logEvery, ')...')
  for (let step = 0; step < steps; step++) {
    const { loss } = nn.trainBatch(XOR_INPUTS, XOR_TARGETS)
    if (step % logEvery === 0) {
      console.log(`step ${step} loss ${loss.toFixed(6)}`)
    }
  }

  console.log('\nFinal predictions (input -> output):')
  for (let i = 0; i < XOR_INPUTS.length; i++) {
    const out = nn.predict(XOR_INPUTS[i])[0]
    const expected = XOR_TARGETS[i][0]
    console.log(`  [${XOR_INPUTS[i].join(', ')}] -> ${out.toFixed(4)} (expected ${expected})`)
  }
}

// Expose to browser console when running in app
if (typeof window !== 'undefined') {
  (window as unknown as { runXorDemo: () => void }).runXorDemo = runXorDemo
}
