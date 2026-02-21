import { runXorDemo } from './xorDemo'

export function registerNNDemos(): void {
  ;(window as unknown as { runXorDemo: () => void }).runXorDemo = runXorDemo
}
