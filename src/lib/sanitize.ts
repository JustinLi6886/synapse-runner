import { PG_DEFAULTS } from "@/lib/pg-defaults"

const MAX_JSON_IMPORT_CHARS = 12_000_000
export const MAX_DATASET_SAMPLES = 200_000
export const MAX_OBS_COMPONENTS = 32
export const MAX_HISTORY_POINTS = 10_000

export const VALID_APP_MODES = ["human", "imitation", "policy-gradient", "evolution"] as const
export type AppMode = (typeof VALID_APP_MODES)[number]

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function sanitizeFiniteNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

export function sanitizeImportedText(raw: string, maxChars: number = MAX_JSON_IMPORT_CHARS): string | null {
  if (typeof raw !== "string") return null
  if (raw.includes("\0")) return null
  if (raw.length > maxChars) return null
  return raw
}

export function sanitizeAppMode(raw: unknown): AppMode {
  if (typeof raw === "string" && (VALID_APP_MODES as readonly string[]).includes(raw)) {
    return raw as AppMode
  }
  return "human"
}

export function sanitizeTheme(raw: unknown): "light" | "dark" {
  if (raw === "light" || raw === "dark") return raw
  return "light"
}

export function sanitizeBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback
}

export function sanitizeProbability(raw: unknown, fallback: number): number {
  const n = sanitizeFiniteNumber(raw, fallback)
  return clamp(n, 0, 1)
}

export function parseNumberInput(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return clamp(n, min, max)
}

export function sanitizeLabel(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "—"
  const t = [...raw].filter((c) => c !== "\0").join("").trim()
  return t.length <= maxLen ? t || "—" : t.slice(0, maxLen)
}

export function sanitizePgPersisted(threshold: number, evalT: number, rolloutT: number, sim: number): {
  threshold: number
  evalLogitTemperature: number
  rolloutSamplingTemperature: number
  simSpeed: number
} {
  return {
    threshold: sanitizeProbability(threshold, PG_DEFAULTS.jumpThreshold),
    evalLogitTemperature: clamp(sanitizeFiniteNumber(evalT, PG_DEFAULTS.evalLogitTemperature), 0.5, 20),
    rolloutSamplingTemperature: clamp(sanitizeFiniteNumber(rolloutT, PG_DEFAULTS.rolloutSamplingTemperature), 0.15, 5),
    simSpeed: clamp(Math.round(sanitizeFiniteNumber(sim, PG_DEFAULTS.simSpeed)), 1, 500),
  }
}
