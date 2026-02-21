import type { Action } from "@/game/types"

export interface DataSample {
  obs: number[]
  action: Action
}

export class Dataset {
  private samples: DataSample[] = []
  private _recording = false

  get recording(): boolean {
    return this._recording
  }

  get size(): number {
    return this.samples.length
  }

  get balance(): { jump: number; noop: number } {
    let jump = 0
    let noop = 0
    for (const s of this.samples) {
      if (s.action === 1) jump++
      else noop++
    }
    return { jump, noop }
  }

  startRecording(): void {
    this._recording = true
  }

  stopRecording(): void {
    this._recording = false
  }

  record(obs: number[], action: Action): void {
    if (!this._recording) return
    this.samples.push({ obs: [...obs], action })
  }

  clear(): void {
    this.samples = []
    this._recording = false
  }

  getSamples(): DataSample[] {
    return this.samples
  }

  getBalancedSamples(): DataSample[] {
    const jumps = this.samples.filter((s) => s.action === 1)
    const noops = this.samples.filter((s) => s.action === 0)
    const minLen = Math.min(jumps.length, noops.length)
    if (minLen === 0) return []
    return [...jumps.slice(0, minLen), ...noops.slice(0, minLen)]
  }

  exportJSON(): string {
    return JSON.stringify(this.samples)
  }

  importJSON(json: string): void {
    const parsed = JSON.parse(json) as DataSample[]
    this.samples = parsed
  }
}
