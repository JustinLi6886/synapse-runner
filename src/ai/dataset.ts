import type { Action } from "@/game/types"
import { MAX_DATASET_SAMPLES, MAX_OBS_COMPONENTS } from "@/lib/sanitize"

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

  importJSON(json: string): boolean {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return false
    }
    if (!Array.isArray(parsed)) return false
    const rows = parsed.length > MAX_DATASET_SAMPLES ? parsed.slice(0, MAX_DATASET_SAMPLES) : parsed
    const out: DataSample[] = []
    for (const row of rows) {
      if (!row || typeof row !== "object") continue
      const o = row as { obs?: unknown; action?: unknown }
      if (!Array.isArray(o.obs)) continue
      const action: 0 | 1 = o.action === 1 ? 1 : 0
      const rawObs = o.obs.length > MAX_OBS_COMPONENTS ? o.obs.slice(0, MAX_OBS_COMPONENTS) : o.obs
      const obs = rawObs.map((x) => {
        const n = Number(x)
        return Number.isFinite(n) ? n : 0
      })
      out.push({ obs, action })
    }
    this.samples = out
    return true
  }
}
