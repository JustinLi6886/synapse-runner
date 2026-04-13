import { useRef, useState, useCallback, useEffect } from "react"
import { Dataset } from "@/ai/dataset"
import { NeuralNetwork } from "@/nn/NeuralNetwork"
import { trainImitation } from "@/ai/imitation"
import type { Action } from "@/game/types"
import type { DataSample } from "@/ai/dataset"
import { getPersisted, schedulePersist } from "@/lib/app-persist"

function createInitialDataset(): Dataset {
  const ds = new Dataset()
  const pi = getPersisted()?.imitation
  if (pi?.datasetJson) {
    try {
      ds.importJSON(pi.datasetJson)
    } catch {
      /* ignore */
    }
  }
  return ds
}

function initialDatasetStats(): { size: number; balance: { jump: number; noop: number } } {
  const pi = getPersisted()?.imitation
  if (!pi?.datasetJson) return { size: 0, balance: { jump: 0, noop: 0 } }
  try {
    const parsed = JSON.parse(pi.datasetJson) as DataSample[]
    let jump = 0
    let noop = 0
    for (const s of parsed) {
      if (s.action === 1) jump++
      else noop++
    }
    return { size: parsed.length, balance: { jump, noop } }
  } catch {
    return { size: 0, balance: { jump: 0, noop: 0 } }
  }
}

export interface ImitationMetrics {
  precision: number
  recall: number
  f1: number
}

function computePRF1(model: NeuralNetwork, samples: DataSample[], threshold: number): ImitationMetrics | null {
  if (samples.length === 0) return null
  let tp = 0,
    fp = 0,
    fn = 0
  for (const s of samples) {
    const pred = model.predict(s.obs)[0] >= threshold ? 1 : 0
    const actual = s.action
    if (pred === 1 && actual === 1) tp++
    else if (pred === 1 && actual === 0) fp++
    else if (pred === 0 && actual === 1) fn++
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return { precision, recall, f1 }
}

function findOptimalThreshold(model: NeuralNetwork, samples: DataSample[]): number {
  if (samples.length === 0) return 0.5
  let bestT = 0.5
  let bestF1 = 0
  for (let t = 0.2; t <= 0.8; t += 0.02) {
    const m = computePRF1(model, samples, t)
    if (m && m.f1 > bestF1) {
      bestF1 = m.f1
      bestT = t
    }
  }
  return Math.round(bestT * 100) / 100
}

export interface ImitationState {
  datasetSize: number
  datasetBalance: { jump: number; noop: number }
  isRecording: boolean
  model: NeuralNetwork | null
  lossHistory: { name: string; value: number }[]
  isTraining: boolean
  threshold: number
  thresholdAuto: boolean
  isEvaluating: boolean
  finalLoss: number | null
  metrics: ImitationMetrics | null
  bestEvalScore: number
  evalRunCount: number
}

export interface ImitationActions {
  toggleRecording: () => void
  recordSample: (obs: number[], action: Action) => void
  clearDataset: () => void
  exportDataset: () => void
  importDataset: (json: string) => void
  exportModel: () => void
  importModel: (json: string) => void
  train: (epochs: number, lr: number, batchSize: number) => void
  stopTraining: () => void
  setThreshold: (t: number) => void
  setThresholdAuto: (v: boolean) => void
  setEvaluating: (v: boolean) => void
  reportEvalScore: (score: number) => void
}

export function useImitation(): [ImitationState, ImitationActions] {
  const datasetRef = useRef<Dataset | null>(null)
  if (datasetRef.current == null) {
    datasetRef.current = createInitialDataset()
  }
  const stopRef = useRef(false)

  const pi0 = getPersisted()?.imitation
  const [datasetSize, setDatasetSize] = useState(() => initialDatasetStats().size)
  const [datasetBalance, setDatasetBalance] = useState(() => initialDatasetStats().balance)
  const [isRecording, setIsRecording] = useState(false)
  const [model, setModel] = useState<NeuralNetwork | null>(() => {
    const j = pi0?.modelJson
    if (!j) return null
    try {
      return NeuralNetwork.fromWeights(j)
    } catch {
      return null
    }
  })
  const [lossHistory, setLossHistory] = useState<{ name: string; value: number }[]>(
    () => pi0?.lossHistory ?? [],
  )
  const [isTraining, setIsTraining] = useState(false)
  const [threshold, setThreshold] = useState(() => pi0?.threshold ?? 0.5)
  const [thresholdAuto, setThresholdAuto] = useState(() => pi0?.thresholdAuto ?? true)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [finalLoss, setFinalLoss] = useState<number | null>(() => pi0?.finalLoss ?? null)
  const [metrics, setMetrics] = useState<ImitationMetrics | null>(null)
  const [bestEvalScore, setBestEvalScore] = useState(() => pi0?.bestEvalScore ?? 0)
  const [evalRunCount, setEvalRunCount] = useState(() => pi0?.evalRunCount ?? 0)

  const syncStats = useCallback(() => {
    const d = datasetRef.current!
    setDatasetSize(d.size)
    setDatasetBalance(d.balance)
  }, [])

  const toggleRecording = useCallback(() => {
    const d = datasetRef.current!
    if (d.recording) {
      d.stopRecording()
      setIsRecording(false)
    } else {
      d.startRecording()
      setIsRecording(true)
    }
    syncStats()
  }, [syncStats])

  const recordSample = useCallback((obs: number[], action: Action) => {
    datasetRef.current!.record(obs, action)
    syncStats()
  }, [syncStats])

  const clearDataset = useCallback(() => {
    datasetRef.current!.clear()
    setIsRecording(false)
    syncStats()
  }, [syncStats])

  const exportDataset = useCallback(() => {
    const json = datasetRef.current!.exportJSON()
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "imitation-dataset.json"
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const importDataset = useCallback((json: string) => {
    datasetRef.current!.importJSON(json)
    syncStats()
  }, [syncStats])

  const exportModel = useCallback(() => {
    const m = model
    if (!m) return
    const json = m.exportWeights()
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "imitation-model.json"
    a.click()
    URL.revokeObjectURL(url)
  }, [model])

  const importModel = useCallback((json: string) => {
    try {
      const nn = NeuralNetwork.fromWeights(json)
      setModel(nn)
      setLossHistory([])
      setFinalLoss(null)
      setMetrics(null)
    } catch {
      // Invalid JSON or shape mismatch
    }
  }, [])

  const train = useCallback(async (epochs: number, lr: number, batchSize: number) => {
    const samples = datasetRef.current!.getBalancedSamples()
    if (samples.length === 0) return

    const nn = new NeuralNetwork({ layers: [7, 32, 16, 1], learningRate: lr, seed: 42 })
    setIsTraining(true)
    setLossHistory([])
    setFinalLoss(null)
    setMetrics(null)
    stopRef.current = false

    let lastLoss = 0
    await trainImitation(
      nn,
      samples,
      epochs,
      batchSize,
      (result) => {
        lastLoss = result.loss
        setLossHistory((prev) => [...prev, { name: String(result.epoch), value: Number(result.loss.toFixed(4)) }])
      },
      () => stopRef.current,
    )

    setModel(nn)
    setFinalLoss(lastLoss)
    const allSamples = datasetRef.current!.getSamples()
    if (allSamples.length > 0 && thresholdAuto) {
      const optimal = findOptimalThreshold(nn, allSamples)
      setThreshold(optimal)
    }
    setIsTraining(false)
  }, [thresholdAuto])

  useEffect(() => {
    schedulePersist({
      imitation: {
        datasetJson: datasetRef.current!.exportJSON(),
        modelJson: model ? model.exportWeights() : null,
        threshold,
        thresholdAuto,
        bestEvalScore,
        evalRunCount,
        lossHistory,
        finalLoss,
      },
    })
  }, [
    model,
    datasetSize,
    datasetBalance,
    threshold,
    thresholdAuto,
    bestEvalScore,
    evalRunCount,
    lossHistory,
    finalLoss,
  ])

  /* eslint-disable react-hooks/set-state-in-effect -- PRF metrics from model + dataset + threshold */
  useEffect(() => {
    const m = model
    const samples = datasetRef.current!.getSamples()
    if (!m || samples.length === 0) {
      setMetrics(null)
      return
    }
    const mtr = computePRF1(m, samples, threshold)
    setMetrics(mtr)
  }, [model, datasetSize, datasetBalance, threshold])
  /* eslint-enable react-hooks/set-state-in-effect */

  const reportEvalScore = useCallback((score: number) => {
    setEvalRunCount((c) => c + 1)
    setBestEvalScore((b) => Math.max(b, score))
  }, [])

  const stopTraining = useCallback(() => {
    stopRef.current = true
  }, [])

  const state: ImitationState = {
    datasetSize,
    datasetBalance,
    isRecording,
    model,
    lossHistory,
    isTraining,
    threshold,
    thresholdAuto,
    isEvaluating,
    finalLoss,
    metrics,
    bestEvalScore,
    evalRunCount,
  }

  const actions: ImitationActions = {
    toggleRecording,
    recordSample,
    clearDataset,
    exportDataset,
    importDataset,
    exportModel,
    importModel,
    train,
    stopTraining,
    setThreshold,
    setThresholdAuto,
    setEvaluating: setIsEvaluating,
    reportEvalScore,
  }

  return [state, actions]
}
