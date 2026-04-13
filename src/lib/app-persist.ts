/** Session restore: one JSON blob in localStorage (v1). */

const STORAGE_KEY = "synapse-runner-v1"

export type PersistedV1 = {
  v: 1
  ui: {
    activeMode: string
    headlessPolicyGradient: boolean
    headlessEvolution: boolean
    leftPanelOpen: boolean
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
    bestScore: number
    avgReturnLast50: number
    threshold: number
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
      bestScore: 0,
      avgReturnLast50: 0,
      threshold: 0.5,
      simSpeed: 8,
      updateCount: 0,
      totalUpdates: 0,
      targetUpdates: 500,
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
    cached = normalized
    return normalized
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
      const next = deepMerge(current, patch)
      next.v = 1
      const str = JSON.stringify(next)
      localStorage.setItem(STORAGE_KEY, str)
      cached = next
    } catch {
      // quota or private mode — ignore
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
      const next = deepMerge(current, patch)
      next.v = 1
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      cached = next
    } catch {
      /* ignore */
    }
  }
}
