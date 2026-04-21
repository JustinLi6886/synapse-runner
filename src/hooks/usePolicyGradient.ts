import { useRef, useState, useCallback, useEffect } from "react"
import { NeuralNetwork } from "@/nn/NeuralNetwork"
import {
  actorCriticMinibatchUpdate,
  actorCriticUpdateFromTrajectories,
  DEFAULT_PG_VIEW_WIDTH,
  PG_INPUT_DIM,
  PG_LAYERS_ACTOR,
  PG_LAYERS_CRITIC,
  type TrajectoryStep,
} from "@/ai/actorCritic"
import { getPersisted, schedulePersist } from "@/lib/app-persist"
import { toast } from "@/lib/toast"
import { PG_DEFAULTS } from "@/lib/pg-defaults"
import { sanitizeImportedText } from "@/lib/sanitize"

export type { TrajectoryStep }

export interface PolicyGradientState {
  model: NeuralNetwork | null
  isTraining: boolean
  isEvaluating: boolean
  returnHistory: { name: string; value: number }[]
  bestScore: number
  avgReturnLast50: number
  greedyAvgLast50: number
  greedyEvalHistory: { name: string; value: number }[]
  threshold: number
  thresholdAuto: boolean
  evalLogitTemperature: number
  rolloutSamplingTemperature: number
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
    gaeLambda: number
    learningRate: number
    clipGrad: number
    entropyCoef: number
    jumpThreshold?: number
    jumpThresholdAuto?: boolean
    evalLogitTemperature?: number
    rolloutSamplingTemperature?: number
  }) => void
  stopTraining: () => void
  switchHeadlessAndRestart: (onVisualStopped?: () => void) => void
  setEvaluating: (v: boolean) => void
  setThreshold: (t: number) => void
  setThresholdAuto: (v: boolean) => void
  setEvalLogitTemperature: (t: number) => void
  setRolloutSamplingTemperature: (t: number) => void
  setSimSpeed: (s: number) => void
  setTargetUpdates: (n: number) => void
  clearProgress: () => void
  exportModel: () => void
  importModel: (json: string) => void
  reportEvalScore?: (score: number) => void
  reportEpisodeComplete?: (trajectory: TrajectoryStep[], score: number) => number | null
}

function ensurePgInputDim(actor: NeuralNetwork, critic: NeuralNetwork): void {
  if (actor.getLayerSizes()[0] < PG_INPUT_DIM) actor.expandFirstLayerInputDim(PG_INPUT_DIM)
  if (critic.getLayerSizes()[0] < PG_INPUT_DIM) critic.expandFirstLayerInputDim(PG_INPUT_DIM)
}

function parsePolicyBundle(json: string): { actor: NeuralNetwork; critic: NeuralNetwork } | null {
  const text = sanitizeImportedText(json)
  if (!text) return null
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
  if (data.v === 2 && data.actor && data.critic) {
    try {
      const actor = NeuralNetwork.fromWeights(JSON.stringify(data.actor))
      const critic = NeuralNetwork.fromWeights(JSON.stringify(data.critic))
      ensurePgInputDim(actor, critic)
      return { actor, critic }
    } catch {
      return null
    }
  }
  if (Array.isArray(data.layers) && Array.isArray(data.weights)) {
    try {
      const actor = NeuralNetwork.fromWeights(text)
      const critic = new NeuralNetwork({
        layers: [...PG_LAYERS_CRITIC],
        learningRate: 0.008,
        outputActivation: "linear",
        seed: 43,
      })
      ensurePgInputDim(actor, critic)
      return { actor, critic }
    } catch {
      return null
    }
  }
  return null
}

function serializePolicyBundle(actor: NeuralNetwork, critic: NeuralNetwork): string {
  return JSON.stringify({
    v: 2,
    actor: JSON.parse(actor.exportWeights()) as object,
    critic: JSON.parse(critic.exportWeights()) as object,
  })
}

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
    gaeLambda: number
    learningRate: number
    criticLr: number
    clipGrad: number
    entropyCoef: number
    entropyCoefFloor: number
    entropyAnnealTotalUpdates: number
    entropyAnnealRunStartOrdinal: number
    rolloutSamplingTemperature: number
    jumpThreshold?: number
    jumpThresholdAuto?: boolean
    evalLogitTemperature?: number
  } | null>(null)
  const episodeBufferRef = useRef<{ trajectory: TrajectoryStep[]; score: number }[]>([])
  const updateCountRef = useRef(pp0?.updateCount ?? 0)
  const trainingNetsRef = useRef<{ actor: NeuralNetwork; critic: NeuralNetwork } | null>(null)

  const [actor, setActor] = useState<NeuralNetwork | null>(() => {
    const j = pp0?.modelJson
    if (!j) return null
    return parsePolicyBundle(j)?.actor ?? null
  })
  const [critic, setCritic] = useState<NeuralNetwork | null>(() => {
    const j = pp0?.modelJson
    if (!j) return null
    return parsePolicyBundle(j)?.critic ?? null
  })

  const [isTraining, setIsTraining] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [returnHistory, setReturnHistory] = useState<{ name: string; value: number }[]>(
    () => pp0?.returnHistory ?? [],
  )
  const [bestScore, setBestScore] = useState(() => pp0?.bestScore ?? 0)
  const [avgReturnLast50, setAvgReturnLast50] = useState(() => pp0?.avgReturnLast50 ?? 0)
  const [greedyAvgLast50, setGreedyAvgLast50] = useState(() => pp0?.greedyAvgLast50 ?? 0)
  const [greedyEvalHistory, setGreedyEvalHistory] = useState<{ name: string; value: number }[]>(
    () => pp0?.greedyEvalHistory ?? [],
  )
  const [threshold, setThreshold] = useState(() => pp0?.threshold ?? PG_DEFAULTS.jumpThreshold)
  const [thresholdAuto, setThresholdAuto] = useState(() => pp0?.thresholdAuto ?? PG_DEFAULTS.thresholdAuto)
  const [evalLogitTemperature, setEvalLogitTemperature] = useState(() => {
    const v = pp0?.evalLogitTemperature
    if (v != null && v >= 2) return v
    if (v != null && v < 2) return PG_DEFAULTS.evalLogitTemperature
    return PG_DEFAULTS.evalLogitTemperature
  })
  const [rolloutSamplingTemperature, setRolloutSamplingTemperature] = useState(
    () => pp0?.rolloutSamplingTemperature ?? PG_DEFAULTS.rolloutSamplingTemperature,
  )
  const [simSpeed, setSimSpeed] = useState(() => pp0?.simSpeed ?? PG_DEFAULTS.simSpeed)
  const [updateCount, setUpdateCount] = useState(() => pp0?.updateCount ?? 0)
  const [totalUpdates, setTotalUpdates] = useState(() => pp0?.totalUpdates ?? 0)
  const [targetUpdates, setTargetUpdatesState] = useState(() => pp0?.targetUpdates ?? PG_DEFAULTS.updates)
  const setTargetUpdates = useCallback((n: number) => {
    const valid = Math.max(1, Math.floor(Number(n)) || PG_DEFAULTS.updates)
    setTargetUpdatesState(valid)
    if (optsRef.current) optsRef.current = { ...optsRef.current, updates: valid }
  }, [])
  const [restartRequested, setRestartRequested] = useState(false)
  const recentReturnsRef = useRef<number[]>([])
  const recentGreedyRef = useRef<number[]>([])

  useEffect(() => {
    schedulePersist({
      policyGradient: {
        modelJson:
          actor && critic ? serializePolicyBundle(actor, critic) : null,
        returnHistory,
        greedyEvalHistory,
        bestScore,
        avgReturnLast50,
        greedyAvgLast50,
        threshold,
        thresholdAuto,
        evalLogitTemperature,
        rolloutSamplingTemperature,
        simSpeed,
        updateCount,
        totalUpdates,
        targetUpdates,
      },
    })
  }, [
    actor,
    critic,
    returnHistory,
    greedyEvalHistory,
    bestScore,
    avgReturnLast50,
    greedyAvgLast50,
    threshold,
    thresholdAuto,
    evalLogitTemperature,
    rolloutSamplingTemperature,
    simSpeed,
    updateCount,
    totalUpdates,
    targetUpdates,
  ])

  const train = useCallback(
    async (
      opts: {
        episodesPerUpdate: number
        updates: number
        gamma: number
        gaeLambda: number
        learningRate: number
        clipGrad: number
        entropyCoef: number
        jumpThreshold?: number
        jumpThresholdAuto?: boolean
        evalLogitTemperature?: number
        rolloutSamplingTemperature?: number
      },
      isRestart = false,
    ) => {
      const jumpThreshold = opts.jumpThreshold ?? PG_DEFAULTS.jumpThreshold
      const jumpThresholdAuto = opts.jumpThresholdAuto ?? PG_DEFAULTS.thresholdAuto
      const evalLogitT = opts.evalLogitTemperature ?? PG_DEFAULTS.evalLogitTemperature
      const rolloutTemp = opts.rolloutSamplingTemperature ?? PG_DEFAULTS.rolloutSamplingTemperature
      const entropyFloor = Math.max(0.002, opts.entropyCoef * 0.18)
      const criticLr = opts.learningRate * 2.5
      const actorNet =
        actor ??
        new NeuralNetwork({
          layers: [...PG_LAYERS_ACTOR],
          learningRate: opts.learningRate,
          seed: 42,
          outputBias: PG_DEFAULTS.actorOutputBias,
        })
      const criticNet =
        critic ??
        new NeuralNetwork({
          layers: [...PG_LAYERS_CRITIC],
          learningRate: criticLr,
          outputActivation: "linear",
          seed: 43,
        })
      if (!actor) setActor(actorNet)
      if (!critic) setCritic(criticNet)
      trainingNetsRef.current = { actor: actorNet, critic: criticNet }

      setIsTraining(true)
      stopRef.current = false
      const validUpdates = Math.max(1, Math.floor(Number(opts.updates)) || PG_DEFAULTS.updates)
      const episodesPerUpdate = Math.max(
        1,
        Math.floor(Number(opts.episodesPerUpdate)) || PG_DEFAULTS.episodesPerUpdate,
      )
      episodeBufferRef.current = []

      if (!isRestart) {
        const prev = updateCountRef.current
        const cumulativeTarget = prev + validUpdates
        optsRef.current = {
          ...opts,
          episodesPerUpdate,
          criticLr,
          updates: validUpdates,
          cumulativeTarget,
          jumpThreshold,
          jumpThresholdAuto,
          evalLogitTemperature: evalLogitT,
          entropyCoefFloor: entropyFloor,
          entropyAnnealTotalUpdates: validUpdates,
          entropyAnnealRunStartOrdinal: prev,
          rolloutSamplingTemperature: rolloutTemp,
        }
        if (prev === 0) {
          updateCountRef.current = 0
          setUpdateCount(0)
        }
        setTotalUpdates(cumulativeTarget)
      } else {
        const prevOpts = optsRef.current
        optsRef.current = {
          ...opts,
          episodesPerUpdate,
          criticLr,
          updates: validUpdates,
          cumulativeTarget: prevOpts?.cumulativeTarget ?? validUpdates,
          jumpThreshold,
          jumpThresholdAuto,
          evalLogitTemperature: evalLogitT,
          entropyCoefFloor: prevOpts?.entropyCoefFloor ?? entropyFloor,
          entropyAnnealTotalUpdates: prevOpts?.entropyAnnealTotalUpdates ?? validUpdates,
          entropyAnnealRunStartOrdinal: prevOpts?.entropyAnnealRunStartOrdinal ?? updateCountRef.current,
          rolloutSamplingTemperature: rolloutTemp,
        }
      }

      if (!isHeadless) return

      let count = updateCountRef.current
      let globalBest = bestScore
      const o = optsRef.current!
      const end = o.cumulativeTarget

      try {
        while (count < end && !stopRef.current) {
          const seedBase = count * 100000 + Date.now()
          const policyOrdinal = count + 1
          const stepResult = actorCriticMinibatchUpdate(
            actorNet,
            criticNet,
            {
              gamma: o.gamma,
              gaeLambda: o.gaeLambda,
              actorLr: o.learningRate,
              criticLr: o.criticLr,
              clipGrad: o.clipGrad,
              entropyCoef: o.entropyCoef,
              entropyCoefFloor: o.entropyCoefFloor,
              entropyAnnealTotalUpdates: o.entropyAnnealTotalUpdates,
              entropyAnnealRunStartOrdinal: o.entropyAnnealRunStartOrdinal,
              rolloutSamplingTemperature: o.rolloutSamplingTemperature,
              episodesPerUpdate: o.episodesPerUpdate,
              policyUpdateOrdinal: policyOrdinal,
              greedyEvalThreshold: o.jumpThreshold ?? PG_DEFAULTS.jumpThreshold,
              greedyThresholdAuto: o.jumpThresholdAuto ?? PG_DEFAULTS.thresholdAuto,
              evalLogitTemperature: o.evalLogitTemperature ?? PG_DEFAULTS.evalLogitTemperature,
            },
            seedBase,
            DEFAULT_PG_VIEW_WIDTH,
            () => stopRef.current,
          )
          if (!stepResult.completed) break

          const { avgEpisodeScore, bestScore: epBest, appliedStep, greedyMeanScore, greedyEvalThresholdUsed } =
            stepResult

          if (appliedStep && jumpThresholdAuto && greedyEvalThresholdUsed !== null) {
            setThreshold(greedyEvalThresholdUsed)
          }

          globalBest = Math.max(globalBest, epBest)
          count++
          updateCountRef.current = count
          setUpdateCount(count)

          if (appliedStep) {
            recentReturnsRef.current.push(avgEpisodeScore)
            if (recentReturnsRef.current.length > 50) {
              recentReturnsRef.current.shift()
            }
            const avg50 =
              recentReturnsRef.current.reduce((a, b) => a + b, 0) /
              recentReturnsRef.current.length
            setReturnHistory((prev) => [
              ...prev,
              { name: String(count), value: Number(avgEpisodeScore.toFixed(2)) },
            ])
            setAvgReturnLast50(avg50)

            if (greedyMeanScore !== null && Number.isFinite(greedyMeanScore)) {
              recentGreedyRef.current.push(greedyMeanScore)
              if (recentGreedyRef.current.length > 50) recentGreedyRef.current.shift()
              const g50 =
                recentGreedyRef.current.reduce((a, b) => a + b, 0) / recentGreedyRef.current.length
              setGreedyEvalHistory((prev) => [
                ...prev,
                { name: String(count), value: Number(greedyMeanScore.toFixed(2)) },
              ])
              setGreedyAvgLast50(g50)
            }
          }
          setBestScore(globalBest)

          if (count % 10 === 0 || count === 1) await new Promise((r) => setTimeout(r, 0))
        }
      } finally {
        trainingNetsRef.current = { actor: actorNet, critic: criticNet }
        setActor(actorNet)
        setCritic(criticNet)
        setIsTraining(false)
        if (pendingRestartRef.current) {
          pendingRestartRef.current = false
          setRestartRequested(true)
        }
      }
    },
    [actor, critic, bestScore, isHeadless],
  )

  useEffect(() => {
    if (!restartRequested || !optsRef.current) return
    setRestartRequested(false)
    const isRestart = isRestartingRef.current
    isRestartingRef.current = false
    train(optsRef.current, isRestart)
  }, [restartRequested, train])

  const reportEpisodeComplete = useCallback(
    (trajectory: TrajectoryStep[], score: number): number | null => {
      const opts = optsRef.current
      if (!opts || stopRef.current) {
        trainingNetsRef.current = null
        setIsTraining(false)
        if (pendingRestartRef.current) {
          pendingRestartRef.current = false
          onVisualStoppedRef.current?.()
          onVisualStoppedRef.current = null
          setRestartRequested(true)
        }
        return null
      }
      const nets = trainingNetsRef.current
      if (!nets) return null
      const { actor: actorNet, critic: criticNet } = nets

      episodeBufferRef.current.push({ trajectory, score })
      if (episodeBufferRef.current.length < opts.episodesPerUpdate) {
        return updateCountRef.current * 100000 + Date.now() + episodeBufferRef.current.length * 10007
      }

      const batch = episodeBufferRef.current
      episodeBufferRef.current = []
      const policyOrdinal = updateCountRef.current + 1
      const floor = opts.entropyCoefFloor ?? Math.max(0.002, opts.entropyCoef * 0.18)
      const annealTotal = opts.entropyAnnealTotalUpdates ?? opts.updates
      const annealStart = opts.entropyAnnealRunStartOrdinal ?? 0
      const { avgEpisodeScore, bestScore: epBest, appliedStep, greedyMeanScore, greedyEvalThresholdUsed } =
        actorCriticUpdateFromTrajectories(
          actorNet,
          criticNet,
          batch.map((b) => b.trajectory),
          batch.map((b) => b.score),
          {
            gamma: opts.gamma,
            gaeLambda: opts.gaeLambda,
            actorLr: opts.learningRate,
            criticLr: opts.criticLr,
            clipGrad: opts.clipGrad,
            entropyCoef: opts.entropyCoef,
            entropyCoefFloor: floor,
            entropyAnnealTotalUpdates: annealTotal,
            entropyAnnealRunStartOrdinal: annealStart,
            policyUpdateOrdinal: policyOrdinal,
            rolloutSamplingTemperature: opts.rolloutSamplingTemperature ?? PG_DEFAULTS.rolloutSamplingTemperature,
          },
          opts.jumpThreshold ?? PG_DEFAULTS.jumpThreshold,
          opts.jumpThresholdAuto ?? PG_DEFAULTS.thresholdAuto,
          opts.evalLogitTemperature ?? PG_DEFAULTS.evalLogitTemperature,
        )
      updateCountRef.current += 1
      const n = updateCountRef.current
      setUpdateCount(n)

      if (appliedStep && (opts.jumpThresholdAuto ?? PG_DEFAULTS.thresholdAuto) && greedyEvalThresholdUsed !== null) {
        setThreshold(greedyEvalThresholdUsed)
      }

      if (appliedStep) {
        recentReturnsRef.current.push(avgEpisodeScore)
        if (recentReturnsRef.current.length > 50) recentReturnsRef.current.shift()
        const avg50 = recentReturnsRef.current.reduce((a, b) => a + b, 0) / recentReturnsRef.current.length
        setReturnHistory((prev) => [...prev, { name: String(n), value: Number(avgEpisodeScore.toFixed(2)) }])
        setAvgReturnLast50(avg50)

        if (greedyMeanScore !== null && Number.isFinite(greedyMeanScore)) {
          recentGreedyRef.current.push(greedyMeanScore)
          if (recentGreedyRef.current.length > 50) recentGreedyRef.current.shift()
          const g50 = recentGreedyRef.current.reduce((a, b) => a + b, 0) / recentGreedyRef.current.length
          setGreedyEvalHistory((prev) => [...prev, { name: String(n), value: Number(greedyMeanScore.toFixed(2)) }])
          setGreedyAvgLast50(g50)
        }
      }
      setBestScore((b) => Math.max(b, epBest))

      const target = opts.cumulativeTarget ?? opts.updates
      if (updateCountRef.current >= target) {
        trainingNetsRef.current = null
        setIsTraining(false)
        if (pendingRestartRef.current) {
          pendingRestartRef.current = false
          setRestartRequested(true)
        }
        return null
      }
      return updateCountRef.current * 100000 + Date.now()
    },
    [],
  )

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
    if (!actor || !critic) {
      toast.error("No model to export")
      return
    }
    const json = serializePolicyBundle(actor, critic)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "policy-gradient-model.json"
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Model exported")
  }, [actor, critic])

  const clearProgress = useCallback(() => {
    trainingNetsRef.current = null
    setActor(null)
    setCritic(null)
    setIsEvaluating(false)
    setReturnHistory([])
    setGreedyEvalHistory([])
    setBestScore(0)
    setAvgReturnLast50(0)
    setGreedyAvgLast50(0)
    setUpdateCount(0)
    setTotalUpdates(0)
    updateCountRef.current = 0
    recentReturnsRef.current = []
    recentGreedyRef.current = []
    episodeBufferRef.current = []
    optsRef.current = null
    setThreshold(PG_DEFAULTS.jumpThreshold)
    setThresholdAuto(PG_DEFAULTS.thresholdAuto)
    setEvalLogitTemperature(PG_DEFAULTS.evalLogitTemperature)
    setRolloutSamplingTemperature(PG_DEFAULTS.rolloutSamplingTemperature)
  }, [])

  const importModel = useCallback((json: string) => {
    const parsed = parsePolicyBundle(json)
    if (!parsed) {
      toast.error("Could not import model (invalid file or format)")
      return
    }
    setActor(parsed.actor)
    setCritic(parsed.critic)
    setReturnHistory([])
    setGreedyEvalHistory([])
    setUpdateCount(0)
    setTotalUpdates(0)
    updateCountRef.current = 0
    recentReturnsRef.current = []
    recentGreedyRef.current = []
    episodeBufferRef.current = []
    optsRef.current = null
    setAvgReturnLast50(0)
    setGreedyAvgLast50(0)
    setBestScore(0)
    setThresholdAuto(PG_DEFAULTS.thresholdAuto)
    setThreshold(PG_DEFAULTS.jumpThreshold)
    setEvalLogitTemperature(PG_DEFAULTS.evalLogitTemperature)
    setRolloutSamplingTemperature(PG_DEFAULTS.rolloutSamplingTemperature)
    toast.success("Model imported")
  }, [])

  const setRolloutSamplingTemperatureCb = useCallback((t: number) => {
    setRolloutSamplingTemperature(
      Number.isFinite(t) ? Math.max(0.15, Math.min(3, t)) : PG_DEFAULTS.rolloutSamplingTemperature,
    )
  }, [])

  const setThresholdAutoCb = useCallback((v: boolean) => {
    setThresholdAuto(v)
  }, [])

  const state: PolicyGradientState = {
    model: actor,
    isTraining,
    isEvaluating,
    returnHistory,
    greedyEvalHistory,
    bestScore,
    avgReturnLast50,
    greedyAvgLast50,
    threshold,
    thresholdAuto,
    evalLogitTemperature,
    rolloutSamplingTemperature,
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
    setThresholdAuto: setThresholdAutoCb,
    setEvalLogitTemperature,
    setRolloutSamplingTemperature: setRolloutSamplingTemperatureCb,
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
