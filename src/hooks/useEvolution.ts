import { useRef, useState, useCallback, useEffect } from "react"
import { NeuralNetwork } from "@/nn/NeuralNetwork"
import { evolveGeneration, createPopulation } from "@/ai/evolution"
import type { EvolutionConfig } from "@/ai/evolution"
import { getPersisted, schedulePersist } from "@/lib/app-persist"

function loadEvolutionRefsFromStorage(): {
  population: NeuralNetwork[] | null
  bestEver: { model: NeuralNetwork; fitness: number } | null
} {
  const pe = getPersisted()?.evolution
  if (!pe) return { population: null, bestEver: null }
  if (pe.populationJsons && pe.populationJsons.length > 0) {
    try {
      const pop = pe.populationJsons.map((j) => NeuralNetwork.fromWeights(j))
      const fit = pe.bestEverFitness ?? pe.bestFitness
      return {
        population: pop,
        bestEver: { model: pop[0].clone(), fitness: fit },
      }
    } catch {
      return { population: null, bestEver: null }
    }
  }
  if (pe.modelJson) {
    try {
      const nn = NeuralNetwork.fromWeights(pe.modelJson)
      return {
        population: null,
        bestEver: { model: nn.clone(), fitness: pe.bestEverFitness ?? pe.bestFitness },
      }
    } catch {
      return { population: null, bestEver: null }
    }
  }
  return { population: null, bestEver: null }
}

const NN_LAYERS = [7, 32, 16, 1]
const DEFAULT_THRESHOLD = 0.5
export const EVOLUTION_MAX_SCORE = 1_000_000

export interface EvolutionState {
  model: NeuralNetwork | null
  elites: NeuralNetwork[]
  isTraining: boolean
  isEvaluating: boolean
  showcaseActive: boolean
  fitnessHistory: { name: string; value: number }[]
  bestFitness: number
  genBestFitness: number
  avgFitness: number
  generation: number
  targetGenerations: number
  threshold: number
  /** True only if the last run ended by hitting 1M fitness or finishing all generations — not Stop. */
  runComplete: boolean
}

export interface EvolutionActions {
  train: (opts: {
    populationSize: number
    eliteCount: number
    mutationSigma: number
    generations: number
    evalSeeds: number
  }) => void
  stopTraining: () => void
  setEvaluating: (v: boolean) => void
  setThreshold: (t: number) => void
  clearProgress: () => void
  exportModel: () => void
  importModel: (json: string) => void
  reportArenaComplete: () => void
}

export function useEvolution(isHeadless: boolean): [EvolutionState, EvolutionActions] {
  const stopRef = useRef(false)
  const evoRefsLoaded = useRef(false)
  const populationRef = useRef<NeuralNetwork[] | null>(null)
  const bestEverRef = useRef<{ model: NeuralNetwork; fitness: number } | null>(null)
  if (!evoRefsLoaded.current) {
    evoRefsLoaded.current = true
    const { population, bestEver } = loadEvolutionRefsFromStorage()
    populationRef.current = population
    bestEverRef.current = bestEver
  }
  const arenaResolveRef = useRef<(() => void) | null>(null)
  const isHeadlessRef = useRef(isHeadless)

  const pe0 = getPersisted()?.evolution
  const [model, setModel] = useState<NeuralNetwork | null>(() => {
    const j = pe0?.modelJson
    if (!j) return null
    try {
      return NeuralNetwork.fromWeights(j)
    } catch {
      return null
    }
  })
  const [elites, setElites] = useState<NeuralNetwork[]>([])
  const [isTraining, setIsTraining] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [showcaseActive, setShowcaseActive] = useState(false)
  const [fitnessHistory, setFitnessHistory] = useState<{ name: string; value: number }[]>(
    () => pe0?.fitnessHistory ?? [],
  )
  const [bestFitness, setBestFitness] = useState(() => pe0?.bestFitness ?? 0)
  const [genBestFitness, setGenBestFitness] = useState(() => pe0?.genBestFitness ?? 0)
  const [avgFitness, setAvgFitness] = useState(() => pe0?.avgFitness ?? 0)
  const [generation, setGeneration] = useState(() => pe0?.generation ?? 0)
  const [targetGenerations, setTargetGenerations] = useState(() => pe0?.targetGenerations ?? 100)
  const [threshold, setThreshold] = useState(() => pe0?.threshold ?? DEFAULT_THRESHOLD)
  const [runComplete, setRunComplete] = useState(() => pe0?.runComplete ?? false)

  useEffect(() => {
    isHeadlessRef.current = isHeadless
    if (isHeadless && arenaResolveRef.current) {
      arenaResolveRef.current()
      arenaResolveRef.current = null
    }
  }, [isHeadless])

  useEffect(() => {
    const pop = populationRef.current
    const populationJsons =
      pop && pop.length > 0 ? pop.map((nn) => nn.exportWeights()) : null
    schedulePersist({
      evolution: {
        modelJson: model ? model.exportWeights() : null,
        populationJsons,
        bestEverFitness: bestEverRef.current?.fitness ?? null,
        generation,
        targetGenerations,
        fitnessHistory,
        bestFitness,
        genBestFitness,
        avgFitness,
        threshold,
        runComplete,
      },
    })
  }, [
    model,
    generation,
    targetGenerations,
    fitnessHistory,
    bestFitness,
    genBestFitness,
    avgFitness,
    threshold,
    runComplete,
  ])

  const train = useCallback(async (opts: {
    populationSize: number
    eliteCount: number
    mutationSigma: number
    generations: number
    evalSeeds: number
  }) => {
    if (
      populationRef.current &&
      populationRef.current.length > 0 &&
      (bestEverRef.current?.fitness ?? 0) >= EVOLUTION_MAX_SCORE
    ) {
      return
    }
    setIsTraining(true)
    stopRef.current = false
    setRunComplete(false)

    let pop = populationRef.current
    let startGen = generation
    if (!pop || pop.length !== opts.populationSize) {
      pop = createPopulation(opts.populationSize, NN_LAYERS, 0.003)
      populationRef.current = pop
      bestEverRef.current = null
      startGen = 0
      setGeneration(0)
      setFitnessHistory([])
      setBestFitness(0)
      setGenBestFitness(0)
      setAvgFitness(0)
    }

    const endGen = startGen + opts.generations
    setTargetGenerations(endGen)

    let gen = startGen
    const currentThreshold = threshold

    const config: EvolutionConfig = {
      populationSize: opts.populationSize,
      eliteCount: opts.eliteCount,
      mutationSigma: opts.mutationSigma,
      evalSeeds: opts.evalSeeds,
      threshold: currentThreshold,
    }

    try {
      while (gen < endGen && !stopRef.current) {
        // Phase 1: Headless evaluation of entire population
        const genSeed = gen * 100003 + Date.now()
        const outcome = evolveGeneration(pop!, config, genSeed, () => stopRef.current)
        if (!outcome) break

        pop = outcome.population
        populationRef.current = pop
        gen++

        const { bestFitness: genBest, avgFitness: genAvg } = outcome.result

        if (!bestEverRef.current || genBest > bestEverRef.current.fitness) {
          bestEverRef.current = { model: pop[0].clone(), fitness: genBest }
        }

        const solved = bestEverRef.current.fitness >= EVOLUTION_MAX_SCORE
        setGeneration(gen)
        setGenBestFitness(Math.round(genBest))
        setAvgFitness(Math.round(genAvg))
        setBestFitness(Math.round(bestEverRef.current.fitness))
        setModel(bestEverRef.current.model)
        setFitnessHistory((prev) => [
          ...prev,
          { name: String(gen), value: Math.round(genBest) },
        ])

        // Phase 2: Visual showcase — top 12 play in real-time
        if (!isHeadlessRef.current && !stopRef.current) {
          const showCount = Math.min(12, pop.length)
          setElites(pop.slice(0, showCount))
          setShowcaseActive(true)
          await new Promise<void>((resolve) => {
            arenaResolveRef.current = resolve
          })
          arenaResolveRef.current = null
          setShowcaseActive(false)
        } else {
          await new Promise((r) => setTimeout(r, 0))
        }

        if (solved) break
      }
    } finally {
      setShowcaseActive(false)
      if (bestEverRef.current) {
        setModel(bestEverRef.current.model)
      }
      setIsTraining(false)
      const finishedClean =
        !stopRef.current &&
        ((bestEverRef.current?.fitness ?? 0) >= EVOLUTION_MAX_SCORE || gen >= endGen)
      setRunComplete(finishedClean)
    }
  }, [generation, threshold])

  const stopTraining = useCallback(() => {
    stopRef.current = true
    arenaResolveRef.current?.()
    arenaResolveRef.current = null
  }, [])

  const reportArenaComplete = useCallback(() => {
    arenaResolveRef.current?.()
    arenaResolveRef.current = null
  }, [])

  const clearProgress = useCallback(() => {
    populationRef.current = null
    bestEverRef.current = null
    setModel(null)
    setElites([])
    setIsEvaluating(false)
    setShowcaseActive(false)
    setFitnessHistory([])
    setBestFitness(0)
    setGenBestFitness(0)
    setAvgFitness(0)
    setGeneration(0)
    setRunComplete(false)
  }, [])

  const exportModel = useCallback(() => {
    const m = model
    if (!m) return
    const json = m.exportWeights()
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "evolution-model.json"
    a.click()
    URL.revokeObjectURL(url)
  }, [model])

  const importModel = useCallback((json: string) => {
    try {
      const nn = NeuralNetwork.fromWeights(json)
      setModel(nn)
      bestEverRef.current = { model: nn.clone(), fitness: 0 }
      populationRef.current = null
      setRunComplete(false)
      setGeneration(0)
      setTargetGenerations(100)
      setFitnessHistory([])
      setBestFitness(0)
      setGenBestFitness(0)
      setAvgFitness(0)
      setElites([])
    } catch {
      // Invalid JSON or shape mismatch
    }
  }, [])

  const state: EvolutionState = {
    model,
    elites,
    isTraining,
    isEvaluating,
    showcaseActive,
    fitnessHistory,
    bestFitness,
    genBestFitness,
    avgFitness,
    generation,
    targetGenerations,
    threshold,
    runComplete,
  }

  const actions: EvolutionActions = {
    train,
    stopTraining,
    setEvaluating: setIsEvaluating,
    setThreshold,
    clearProgress,
    exportModel,
    importModel,
    reportArenaComplete,
  }

  return [state, actions]
}
