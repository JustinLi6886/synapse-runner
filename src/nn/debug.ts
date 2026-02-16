import { runXorDemo } from './xorDemo'

/** Attach demos to window so we can run them from the console in dev. */
export function registerNNDemos(): void {
  ;(window as unknown as { runXorDemo: () => void }).runXorDemo = runXorDemo
}
