import { useRef, useState, useCallback, useEffect } from "react"
import { NeuralNetwork } from "@/nn/NeuralNetwork"
import { reinforceUpdate, policyUpdateFromTrajectories } from "@/ai/reinforce"
import type { TrajectoryStep } from "@/ai/reinforce"
import { getPersisted, schedulePersist } from "@/lib/app-persist"

export interface PolicyGradientState {
  model: NeuralNetwork | null
  isTraining: boolean
  isEvaluating: boolean
  returnHistory: { name: string; value: number }[]
  bestScore: number
  avgReturnLast50: number
  threshold: number
  simSpeed: number
  updateCount: number
  totalUpdates: number
  targetUpdates: number
}

export interface PolicyGradientActions {
  train: (opts: {
    episodesPerUpdate: number
    updates: number
    gamma: number
    learningRate: number
    clipGrad: number
    entropyCoef: number
  }) => void
  stopTraining: () => void
  /** Stop current training and restart in the new mode. Pass onVisualStopped when switching TO headless so we delay the toggle until the episode reports. */
  switchHeadlessAndRestart: (onVisualStopped?: () => void) => void
  setEvaluating: (v: boolean) => void
  setThreshold: (t: number) => void
  setSimSpeed: (s: number) => void
  setTargetUpdates: (n: number) => void
  clearProgress: () => void
  exportModel: () => void
  importModel: (json: string) => void
  reportEvalScore?: (score: number) => void
  /** When visual training: call with trajectory and score. Returns next seed to reset with, or null to stop. */
  reportEpisodeComplete?: (trajectory: TrajectoryStep[], score: number) => number | null
}

const NN_LAYERS = [7, 32, 16, 1]
const DEFAULT_THRESHOLD = 0.5

export function usePolicyGradient(isHeadless: boolean): [PolicyGradientState, PolicyGradientActions] {
  const pp0 = getPersisted()?.policyGradient
  const stopRef = useRef(false)
  const pendingRestartRef = useRef(false)
  const isRestartingRef = useRef(false)
  const onVisualStoppedRef = useRef<(() => void) | null>(null)
  const optsRef = useRef<{
    episodesPerUpdate: number
    updates: number
    cumulativeTarget: number
    gamma: number
    learningRate: number
    clipGrad: number
    entropyCoef: number
  } | null>(null)
  const episodeBufferRef = useRef<{ trajectory: TrajectoryStep[]; score: number }[]>([])
  const updateCountRef = useRef(pp0?.updateCount ?? 0)
  const [model, setModel] = useState<NeuralNetwork | null>(() => {
    const j = pp0?.modelJson
    if (!j) return null
    try {
      return NeuralNetwork.fromWeights(j)
    } catch {
      return null
    }
  })
  const [isTraining, setIsTraining] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [returnHistory, setReturnHistory] = useState<{ name: string; value: number }[]>(
    () => pp0?.returnHistory ?? [],
  )
  const [bestScore, setBestScore] = useState(() => pp0?.bestScore ?? 0)
  const [avgReturnLast50, setAvgReturnLast50] = useState(() => pp0?.avgReturnLast50 ?? 0)
  const [threshold, setThreshold] = useState(() => pp0?.threshold ?? DEFAULT_THRESHOLD)
  const [simSpeed, setSimSpeed] = useState(() => pp0?.simSpeed ?? 8)
  const [updateCount, setUpdateCount] = useState(() => pp0?.updateCount ?? 0)
  const [totalUpdates, setTotalUpdates] = useState(() => pp0?.totalUpdates ?? 0)
  const [targetUpdates, setTargetUpdatesState] = useState(() => pp0?.targetUpdates ?? 500)
  const setTargetUpdates = useCallback((n: number) => {
    const valid = Math.max(1, Math.floor(Number(n)) || 500)
    setTargetUpdatesState(valid)
    if (optsRef.current) optsRef.current = { ...optsRef.current, updates: valid }
  }, [])
  const [restartRequested, setRestartRequested] = useState(false)
  const recentReturnsRef = useRef<number[]>([])

  useEffect(() => {
    schedulePersist({
      policyGradient: {
        modelJson: model ? model.exportWeights() : null,
        returnHistory,
        bestScore,
        avgReturnLast50,
        threshold,
        simSpeed,
        updateCount,
        totalUpdates,
        targetUpdates,
      },
    })
  }, [
    model,
    returnHistory,
    bestScore,
    avgReturnLast50,
    threshold,
    simSpeed,
    updateCount,
    totalUpdates,
    targetUpdates,
  ])

  const train = useCallback(
    async (opts: {
      episodesPerUpdate: number
      updates: number
      gamma: number
      learningRate: number
      clipGrad: number
      entropyCoef: number
    }, isRestart = false) => {
      const nn = model ?? new NeuralNetwork({
        layers: NN_LAYERS,
        learningRate: opts.learningRate,
        seed: 42,
        outputBias: 0,
      })
      if (!model) setModel(nn)

      setIsTraining(true)
      stopRef.current = false
      const validUpdates = Math.max(1, Math.floor(Number(opts.updates)) || 500)
      episodeBufferRef.current = []

      if (!isRestart) {
        const prev = updateCountRef.current
        const cumulativeTarget = prev + validUpdates
        optsRef.current = { ...opts, updates: validUpdates, cumulativeTarget }
        if (prev === 0) {
          updateCountRef.current = 0
          setUpdateCount(0)
        }
        setTotalUpdates(cumulativeTarget)
      } else {
        const prevOpts = optsRef.current
        optsRef.current = {
          ...opts,
          updates: validUpdates,
          cumulativeTarget: prevOpts?.cumulativeTarget ?? validUpdates,
        }
      }

      if (!isHeadless) return

      let count = updateCountRef.current
      let globalBest = bestScore
      const end = optsRef.current!.cumulativeTarget

      try {
        while (count < end && !stopRef.current) {
          const seedBase = count * 100000 + Date.now()
          const { avgReturn, bestScore: epBest } = reinforceUpdate(
            nn,
            {
              gamma: opts.gamma,
              learningRate: opts.learningRate,
              clipGrad: opts.clipGrad,
              episodesPerUpdate: opts.episodesPerUpdate,
              entropyCoef: opts.entropyCoef,
            },
            seedBase,
            undefined,
            () => stopRef.current,
          )

          recentReturnsRef.current.push(avgReturn)
          if (recentReturnsRef.current.length > 50) {
            recentReturnsRef.current.shift()
          }
          const avg50 =
            recentReturnsRef.current.reduce((a, b) => a + b, 0) /
            recentReturnsRef.current.length

          globalBest = Math.max(globalBest, epBest)
          count++
          updateCountRef.current = count
          setUpdateCount(count)

          setReturnHistory((prev) => [
            ...prev,
            { name: String(prev.length + 1), value: Number(avgReturn.toFixed(2)) },
          ])
          setBestScore(globalBest)
          setAvgReturnLast50(avg50)

          if (count % 10 === 0 || count === 1) await new Promise((r) => setTimeout(r, 0))
        }
      } finally {
        setModel(nn)
        setIsTraining(false)
        if (pendingRestartRef.current) {
          pendingRestartRef.current = false
          setRestartRequested(true)
        }
      }
    },
    [model, bestScore, isHeadless]
  )

  useEffect(() => {
    if (!restartRequested || !optsRef.current) return
    setRestartRequested(false)
    const isRestart = isRestartingRef.current
    isRestartingRef.current = false
    train(optsRef.current, isRestart)
  }, [restartRequested, train])

  const reportEpisodeComplete = useCallback((trajectory: TrajectoryStep[], score: number): number | null => {
    const opts = optsRef.current
    if (!opts || stopRef.current) {
      setIsTraining(false)
      if (pendingRestartRef.current) {
        pendingRestartRef.current = false
        onVisualStoppedRef.current?.()
        onVisualStoppedRef.current = null
        setRestartRequested(true)
      }
      return null
    }
    const nn = model
    if (!nn) return null

    episodeBufferRef.current.push({ trajectory, score })
    if (episodeBufferRef.current.length < opts.episodesPerUpdate) {
      return updateCountRef.current * 100000 + Date.now() + episodeBufferRef.current.length * 10007
    }

    const batch = episodeBufferRef.current
    episodeBufferRef.current = []
    const { avgReturn, bestScore: epBest } = policyUpdateFromTrajectories(
      nn,
      batch.map((b) => b.trajectory),
      batch.map((b) => b.score),
      { gamma: opts.gamma, learningRate: opts.learningRate, clipGrad: opts.clipGrad, entropyCoef: opts.entropyCoef },
    )
    updateCountRef.current += 1
    setUpdateCount(updateCountRef.current)

    recentReturnsRef.current.push(avgReturn)
    if (recentReturnsRef.current.length > 50) recentReturnsRef.current.shift()
    const avg50 = recentReturnsRef.current.reduce((a, b) => a + b, 0) / recentReturnsRef.current.length

    setReturnHistory((prev) => [...prev, { name: String(prev.length + 1), value: Number(avgReturn.toFixed(2)) }])
    setBestScore((b) => Math.max(b, epBest))
    setAvgReturnLast50(avg50)

    const target = opts.cumulativeTarget ?? opts.updates
    if (updateCountRef.current >= target) {
      setIsTraining(false)
      if (pendingRestartRef.current) {
        pendingRestartRef.current = false
        setRestartRequested(true)
      }
      return null
    }
    return updateCountRef.current * 100000 + Date.now()
  }, [model])

  const stopTraining = useCallback(() => {
    stopRef.current = true
  }, [])

  const switchHeadlessAndRestart = useCallback((onVisualStopped?: () => void) => {
    stopRef.current = true
    pendingRestartRef.current = true
    isRestartingRef.current = true
    onVisualStoppedRef.current = onVisualStopped ?? null
  }, [])

  const exportModel = useCallback(() => {
    const m = model
    if (!m) return
    const json = m.exportWeights()
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "policy-gradient-model.json"
    a.click()
    URL.revokeObjectURL(url)
  }, [model])

  const clearProgress = useCallback(() => {
    setModel(null)
    setIsEvaluating(false)
    setReturnHistory([])
    setBestScore(0)
    setAvgReturnLast50(0)
    setUpdateCount(0)
    setTotalUpdates(0)
    updateCountRef.current = 0
    recentReturnsRef.current = []
    episodeBufferRef.current = []
    optsRef.current = null
  }, [])

  const importModel = useCallback((json: string) => {
    try {
      const nn = NeuralNetwork.fromWeights(json)
      setModel(nn)
      setReturnHistory([])
      setUpdateCount(0)
      setTotalUpdates(0)
      updateCountRef.current = 0
      recentReturnsRef.current = []
      episodeBufferRef.current = []
      optsRef.current = null
      setAvgReturnLast50(0)
      setBestScore(0)
    } catch {
      // Invalid JSON or shape mismatch
    }
  }, [])

  const state: PolicyGradientState = {
    model,
    isTraining,
    isEvaluating,
    returnHistory,
    bestScore,
    avgReturnLast50,
    threshold,
    simSpeed,
    updateCount,
    totalUpdates,
    targetUpdates,
  }

  const reportEvalScore = useCallback((score: number) => {
    setBestScore((b) => Math.max(b, score))
  }, [])

  const actions: PolicyGradientActions = {
    train,
    stopTraining,
    switchHeadlessAndRestart,
    setEvaluating: setIsEvaluating,
    setThreshold,
    setSimSpeed,
    setTargetUpdates,
    clearProgress,
    exportModel,
    importModel,
    reportEvalScore,
    reportEpisodeComplete: !isHeadless && isTraining ? reportEpisodeComplete : undefined,
  }

  return [state, actions]
}
