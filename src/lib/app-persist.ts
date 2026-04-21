import { PG_DEFAULTS } from "@/lib/pg-defaults"
import {
  clamp,
  MAX_HISTORY_POINTS,
  sanitizeAppMode,
  sanitizeBool,
  sanitizeFiniteNumber,
  sanitizeLabel,
  sanitizeProbability,
  sanitizePgPersisted,
  sanitizeTheme,
} from "@/lib/sanitize"

const STORAGE_KEY = "synapse-runner-v1"

const MAX_MODEL_JSON_CHARS = 20_000_000
const MAX_DATASET_JSON_CHARS = 16_000_000

type PersistedV1 = {
  v: 1
  ui: {
    activeMode: string
    headlessPolicyGradient: boolean
    headlessEvolution: boolean
    leftPanelOpen: boolean
    theme: "light" | "dark"
  }
  imitation: {
    datasetJson: string
    modelJson: string | null
    threshold: number
    thresholdAuto: boolean
    bestEvalScore: number
    evalRunCount: number
    lossHistory: { name: string; value: number }[]
    finalLoss: number | null
  }
  policyGradient: {
    modelJson: string | null
    returnHistory: { name: string; value: number }[]
    greedyEvalHistory: { name: string; value: number }[]
    bestScore: number
    avgReturnLast50: number
    greedyAvgLast50: number
    threshold: number
    thresholdAuto: boolean
    evalLogitTemperature: number
    rolloutSamplingTemperature: number
    simSpeed: number
    updateCount: number
    totalUpdates: number
    targetUpdates: number
  }
  evolution: {
    modelJson: string | null
    populationJsons: string[] | null
    bestEverFitness: number | null
    generation: number
    targetGenerations: number
    fitnessHistory: { name: string; value: number }[]
    bestFitness: number
    genBestFitness: number
    avgFitness: number
    threshold: number
    runComplete: boolean
  }
}

let cached: PersistedV1 | null | undefined

function normalizePersisted(raw: unknown): PersistedV1 | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as { v?: unknown }
  if (o.v !== 1) return null
  return deepMerge(defaultPersisted(), o as Partial<PersistedV1>)
}

function sanitizeOptionalModelJson(s: unknown): string | null {
  if (s === null || s === undefined) return null
  if (typeof s !== "string") return null
  if (s.includes("\0")) return null
  if (s.length > MAX_MODEL_JSON_CHARS) return null
  return s
}

function sanitizeDatasetJsonField(s: unknown): string {
  if (typeof s !== "string") return "[]"
  if (s.includes("\0")) return "[]"
  if (s.length > MAX_DATASET_JSON_CHARS) return "[]"
  return s
}

function sanitizeHistoryRows(rows: unknown): { name: string; value: number }[] {
  if (!Array.isArray(rows)) return []
  const slice = rows.slice(-MAX_HISTORY_POINTS)
  return slice.map((row) => {
    const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
    return {
      name: sanitizeLabel(r.name, 200),
      value: sanitizeFiniteNumber(r.value, 0),
    }
  })
}

function sanitizePopulationJsons(raw: unknown): string[] | null {
  if (raw === null) return null
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  for (const item of raw.slice(0, 500)) {
    if (typeof item === "string" && !item.includes("\0") && item.length <= MAX_MODEL_JSON_CHARS) {
      out.push(item)
    }
  }
  return out.length > 0 ? out : null
}

function sanitizePersistedSnapshot(p: PersistedV1): PersistedV1 {
  const pg0 = p.policyGradient
  const pgT = sanitizePgPersisted(
    pg0.threshold,
    pg0.evalLogitTemperature,
    pg0.rolloutSamplingTemperature,
    pg0.simSpeed,
  )
  return {
    v: 1,
    ui: {
      activeMode: sanitizeAppMode(p.ui?.activeMode),
      headlessPolicyGradient: sanitizeBool(p.ui?.headlessPolicyGradient, false),
      headlessEvolution: sanitizeBool(p.ui?.headlessEvolution, false),
      leftPanelOpen: sanitizeBool(p.ui?.leftPanelOpen, true),
      theme: sanitizeTheme(p.ui?.theme),
    },
    imitation: {
      datasetJson: sanitizeDatasetJsonField(p.imitation?.datasetJson),
      modelJson: sanitizeOptionalModelJson(p.imitation?.modelJson),
      threshold: sanitizeProbability(p.imitation?.threshold, 0.5),
      thresholdAuto: sanitizeBool(p.imitation?.thresholdAuto, true),
      bestEvalScore: clamp(sanitizeFiniteNumber(p.imitation?.bestEvalScore, 0), 0, 1e9),
      evalRunCount: clamp(Math.floor(sanitizeFiniteNumber(p.imitation?.evalRunCount, 0)), 0, 1e7),
      lossHistory: sanitizeHistoryRows(p.imitation?.lossHistory),
      finalLoss:
        p.imitation?.finalLoss === null || p.imitation?.finalLoss === undefined
          ? null
          : sanitizeFiniteNumber(p.imitation?.finalLoss, 0),
    },
    policyGradient: {
      modelJson: sanitizeOptionalModelJson(pg0.modelJson),
      returnHistory: sanitizeHistoryRows(pg0.returnHistory),
      greedyEvalHistory: sanitizeHistoryRows(pg0.greedyEvalHistory),
      bestScore: clamp(sanitizeFiniteNumber(pg0.bestScore, 0), 0, 1e9),
      avgReturnLast50: sanitizeFiniteNumber(pg0.avgReturnLast50, 0),
      greedyAvgLast50: sanitizeFiniteNumber(pg0.greedyAvgLast50, 0),
      threshold: pgT.threshold,
      thresholdAuto: sanitizeBool(pg0.thresholdAuto, PG_DEFAULTS.thresholdAuto),
      evalLogitTemperature: pgT.evalLogitTemperature,
      rolloutSamplingTemperature: pgT.rolloutSamplingTemperature,
      simSpeed: pgT.simSpeed,
      updateCount: clamp(Math.floor(sanitizeFiniteNumber(pg0.updateCount, 0)), 0, 1e9),
      totalUpdates: clamp(Math.floor(sanitizeFiniteNumber(pg0.totalUpdates, 0)), 0, 1e9),
      targetUpdates: clamp(Math.floor(sanitizeFiniteNumber(pg0.targetUpdates, PG_DEFAULTS.updates)), 1, 1e9),
    },
    evolution: {
      modelJson: sanitizeOptionalModelJson(p.evolution?.modelJson),
      populationJsons: sanitizePopulationJsons(p.evolution?.populationJsons),
      bestEverFitness:
        p.evolution?.bestEverFitness === null || p.evolution?.bestEverFitness === undefined
          ? null
          : clamp(sanitizeFiniteNumber(p.evolution?.bestEverFitness, 0), 0, 1e12),
      generation: clamp(Math.floor(sanitizeFiniteNumber(p.evolution?.generation, 0)), 0, 1e9),
      targetGenerations: clamp(Math.floor(sanitizeFiniteNumber(p.evolution?.targetGenerations, 100)), 1, 1e9),
      fitnessHistory: sanitizeHistoryRows(p.evolution?.fitnessHistory),
      bestFitness: clamp(sanitizeFiniteNumber(p.evolution?.bestFitness, 0), 0, 1e12),
      genBestFitness: clamp(sanitizeFiniteNumber(p.evolution?.genBestFitness, 0), 0, 1e12),
      avgFitness: clamp(sanitizeFiniteNumber(p.evolution?.avgFitness, 0), 0, 1e12),
      threshold: sanitizeProbability(p.evolution?.threshold, 0.5),
      runComplete: sanitizeBool(p.evolution?.runComplete, false),
    },
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cached = undefined
  })
}

function defaultPersisted(): PersistedV1 {
  return {
    v: 1,
    ui: {
      activeMode: "human",
      headlessPolicyGradient: false,
      headlessEvolution: false,
      leftPanelOpen: true,
      theme: "light",
    },
    imitation: {
      datasetJson: "[]",
      modelJson: null,
      threshold: 0.5,
      thresholdAuto: true,
      bestEvalScore: 0,
      evalRunCount: 0,
      lossHistory: [],
      finalLoss: null,
    },
    policyGradient: {
      modelJson: null,
      returnHistory: [],
      greedyEvalHistory: [],
      bestScore: 0,
      avgReturnLast50: 0,
      greedyAvgLast50: 0,
      threshold: PG_DEFAULTS.jumpThreshold,
      thresholdAuto: PG_DEFAULTS.thresholdAuto,
      evalLogitTemperature: PG_DEFAULTS.evalLogitTemperature,
      rolloutSamplingTemperature: PG_DEFAULTS.rolloutSamplingTemperature,
      simSpeed: PG_DEFAULTS.simSpeed,
      updateCount: 0,
      totalUpdates: 0,
      targetUpdates: PG_DEFAULTS.updates,
    },
    evolution: {
      modelJson: null,
      populationJsons: null,
      bestEverFitness: null,
      generation: 0,
      targetGenerations: 100,
      fitnessHistory: [],
      bestFitness: 0,
      genBestFitness: 0,
      avgFitness: 0,
      threshold: 0.5,
      runComplete: false,
    },
  }
}

export function getPersisted(): PersistedV1 | null {
  if (typeof localStorage === "undefined") return null
  if (cached !== undefined) return cached
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      cached = null
      return null
    }
    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizePersisted(parsed)
    if (!normalized) {
      cached = null
      return null
    }
    const safe = sanitizePersistedSnapshot(normalized)
    cached = safe
    return safe
  } catch {
    cached = null
    return null
  }
}

function readMerged(): PersistedV1 {
  return getPersisted() ?? defaultPersisted()
}

let pending: Partial<PersistedV1> | null = null
let debounceId: ReturnType<typeof setTimeout> | null = null

function deepMerge<T extends object>(base: T, patch: Partial<T>): T {
  const out = { ...base } as T
  for (const k of Object.keys(patch) as (keyof T)[]) {
    const pv = patch[k]
    if (pv === undefined) continue
    const bv = base[k]
    if (
      pv !== null &&
      typeof pv === "object" &&
      !Array.isArray(pv) &&
      bv !== null &&
      typeof bv === "object" &&
      !Array.isArray(bv)
    ) {
      ;(out as Record<string, unknown>)[k as string] = deepMerge(
        bv as object,
        pv as object,
      )
    } else {
      ;(out as Record<string, unknown>)[k as string] = pv as unknown
    }
  }
  return out
}

export function schedulePersist(partial: Partial<PersistedV1>): void {
  if (typeof localStorage === "undefined") return
  pending = pending ? deepMerge(pending as PersistedV1, partial as Partial<PersistedV1>) : partial
  if (debounceId !== null) clearTimeout(debounceId)
  debounceId = setTimeout(() => {
    debounceId = null
    const patch = pending
    pending = null
    if (!patch) return
    try {
      const current = readMerged()
      const next = sanitizePersistedSnapshot(deepMerge(current, patch))
      next.v = 1
      const str = JSON.stringify(next)
      localStorage.setItem(STORAGE_KEY, str)
      cached = next
    } catch {
      /* ignore */
    }
  }, 320)
}

export function flushPersist(): void {
  if (debounceId !== null) {
    clearTimeout(debounceId)
    debounceId = null
  }
  if (pending) {
    const patch = pending
    pending = null
    try {
      const current = readMerged()
      const next = sanitizePersistedSnapshot(deepMerge(current, patch))
      next.v = 1
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      cached = next
    } catch {
      /* ignore */
    }
  }
}
