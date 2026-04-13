import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { InfoTooltip } from "./info-tooltip"
import type { ImitationState, ImitationActions } from "@/hooks/useImitation"
import type { PolicyGradientState, PolicyGradientActions } from "@/hooks/usePolicyGradient"
import { EVOLUTION_MAX_SCORE, type EvolutionState, type EvolutionActions } from "@/hooks/useEvolution"

interface TrainingControlsProps {
  activeMode: string
  imitation?: [ImitationState, ImitationActions]
  policyGradient?: [PolicyGradientState, PolicyGradientActions]
  evolution?: [EvolutionState, EvolutionActions]
  isHeadless?: boolean
  onPolicyGradientEvaluate?: () => void
}

function SliderInput({
  label,
  value,
  min,
  max,
  step,
  id,
  onChange,
  tooltip,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  id: string
  onChange?: (v: number) => void
  tooltip?: string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg p-2 -m-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          {label}
          {tooltip && <InfoTooltip description={tooltip} />}
        </label>
        <span className="text-[11px] font-mono font-medium text-card-foreground tabular-nums">
          {value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange ? (e) => onChange(Number(e.target.value)) : undefined}
        disabled={disabled}
        aria-label={label}
        className={cn(
          "h-1.5 w-full appearance-none rounded-full bg-secondary",
          "accent-primary",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          "[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5",
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
          "[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--card)]",
          "[&::-webkit-slider-thumb]:transition-shadow [&::-webkit-slider-thumb]:hover:shadow-[0_0_0_3px_var(--card),0_0_0_5px_var(--primary)]",
          "focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--ring)]"
        )}
      />
    </div>
  )
}

function StatBlock({ label, value, color = "text-primary" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className={cn("text-lg font-mono font-semibold tabular-nums", color)}>{value}</span>
    </div>
  )
}

function getRecommendedParams(balancedSamples: number) {
  if (balancedSamples < 50) return { epochs: 180, lr: 0.01, batchSize: 8, threshold: 0.68 }
  if (balancedSamples < 150) return { epochs: 150, lr: 0.01, batchSize: 16, threshold: 0.66 }
  if (balancedSamples < 350) return { epochs: 120, lr: 0.01, batchSize: 16, threshold: 0.64 }
  if (balancedSamples < 600) return { epochs: 100, lr: 0.01, batchSize: 16, threshold: 0.62 }
  return { epochs: 80, lr: 0.008, batchSize: 32, threshold: 0.6 }
}

function ImitationControls({ imitation }: { imitation?: [ImitationState, ImitationActions] }) {
  const [epochs, setEpochs] = useState(100)
  const [lr, setLr] = useState(0.01)
  const [batchSize, setBatchSize] = useState(16)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasAutoAppliedRef = useRef(false)

  const state = imitation?.[0]
  const actions = imitation?.[1]

  useEffect(() => {
    if (!state || !actions) return
    if (state.datasetSize === 0) {
      hasAutoAppliedRef.current = false
      return
    }
    const balanced = Math.min(state.datasetBalance.jump, state.datasetBalance.noop) * 2
    if (balanced >= 20 && !hasAutoAppliedRef.current) {
      hasAutoAppliedRef.current = true
      const { epochs: e, lr: l, batchSize: b, threshold: t } = getRecommendedParams(balanced)
      setEpochs(e)
      setLr(l)
      setBatchSize(b)
      actions.setThreshold(t)
    }
  }, [state?.datasetSize, state?.datasetBalance.jump, state?.datasetBalance.noop, state, actions])

  if (!state || !actions) return null

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((json) => {
      actions.importDataset(json)
      if (fileInputRef.current) fileInputRef.current.value = ""
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {state.datasetSize === 0 && !state.model && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-semibold text-primary">Step 1:</span> Switch to{" "}
            <span className="font-semibold text-card-foreground">Human</span> mode and click{" "}
            <span className="font-semibold text-accent">Record</span> while you play.{" "}
            <span className="font-semibold text-primary">Step 2:</span> Come back here to train the model on your gameplay.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg bg-secondary p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Dataset
            <InfoTooltip description="Recorded gameplay: Jump = frames where you jumped, Noop = frames where you didn't. Export saves as JSON; Import loads a file; Clear removes all. When you have 20+ balanced samples, Epochs, Learning Rate, Batch Size, and Jump Threshold auto-adjust to recommended values based on dataset size." />
          </span>
          <span className="text-[11px] font-mono text-card-foreground tabular-nums">{state.datasetSize} samples</span>
        </div>
        {state.datasetSize > 0 && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>Jump: <span className="font-mono text-card-foreground">{state.datasetBalance.jump}</span></span>
            <span>Noop: <span className="font-mono text-card-foreground">{state.datasetBalance.noop}</span></span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <button
            onClick={actions.exportDataset}
            disabled={state.datasetSize === 0}
            className={cn(
              "rounded-md bg-card border border-border px-2.5 py-1 text-[11px] font-medium text-card-foreground",
              "hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-card border border-border px-2.5 py-1 text-[11px] font-medium text-card-foreground hover:bg-secondary/80"
          >
            Import
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          <button
            onClick={actions.clearDataset}
            disabled={state.datasetSize === 0}
            className={cn(
              "rounded-md bg-destructive/10 border border-destructive/20 px-2.5 py-1 text-[11px] font-medium text-destructive",
              "hover:bg-destructive/20 disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="imit-epochs" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Epochs
            <InfoTooltip description="How many times the model learns from the full training data. More epochs often improve accuracy but take longer." />
          </label>
          <input
            id="imit-epochs"
            type="number"
            value={epochs}
            onChange={(e) => setEpochs(Number(e.target.value))}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="imit-lr" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Learning Rate
            <InfoTooltip description="How much the model adjusts its weights each update. Too high can cause erratic or failed training; too low makes learning slow." />
          </label>
          <input
            id="imit-lr"
            type="number"
            step="0.0001"
            value={lr}
            onChange={(e) => setLr(Number(e.target.value))}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="imit-batch" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Batch Size
            <InfoTooltip description="How many samples the model uses before updating its weights. Smaller batches can generalize better but make the loss curve less smooth." />
          </label>
          <input
            id="imit-batch"
            type="number"
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            )}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="imit-threshold-auto" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Auto threshold
            <InfoTooltip description="When on, the threshold is set automatically after training to maximize F1. When off, you control it manually." />
          </label>
          <button
            id="imit-threshold-auto"
            role="switch"
            aria-checked={state.thresholdAuto}
            aria-label="Auto threshold"
            onClick={() => actions.setThresholdAuto(!state.thresholdAuto)}
            className={cn(
              "relative flex h-5 w-9 cursor-pointer items-center rounded-full px-0.5 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              state.thresholdAuto ? "bg-primary" : "bg-secondary"
            )}
          >
            <div
              className={cn(
                "h-4 w-4 rounded-full bg-foreground transition-transform",
                state.thresholdAuto ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>
        <SliderInput
          label="Jump Threshold"
          value={state.threshold}
          min={0}
          max={1}
          step={0.01}
          id="imit-threshold"
          onChange={actions.setThreshold}
          disabled={state.thresholdAuto}
          tooltip="The model outputs a jump probability (0–1). If it exceeds this value, the character jumps. Lower = jumps more often; higher = jumps less often."
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => state.isTraining ? actions.stopTraining() : actions.train(epochs, lr, batchSize)}
          disabled={state.datasetSize === 0 && !state.isTraining}
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            state.isTraining
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {state.isTraining ? "Stop Training" : "Train Model"}
        </button>
        <button
          onClick={() => actions.setEvaluating(!state.isEvaluating)}
          disabled={!state.model}
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            state.model
              ? state.isEvaluating
                ? "border border-accent bg-accent/10 text-accent"
                : "bg-accent text-accent-foreground hover:bg-accent/90"
              : "border border-border bg-card text-card-foreground hover:bg-secondary/80",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {state.isEvaluating ? "Stop" : "Evaluate"}
        </button>
      </div>

    </div>
  )
}

function PolicyGradientControls({ policyGradient: pg, isHeadless, onPolicyGradientEvaluate }: { policyGradient?: [PolicyGradientState, PolicyGradientActions]; isHeadless?: boolean; onPolicyGradientEvaluate?: () => void }) {
  const [gamma, setGamma] = useState(0.95)
  const [lr, setLr] = useState(0.003)
  const [episodesPerUpdate, setEpisodesPerUpdate] = useState(32)
  const [updates, setUpdates] = useState(500)
  const [clipGrad, setClipGrad] = useState(2)
  const [entropyCoef, setEntropyCoef] = useState(0.08)

  if (!pg) return null
  const [state, actions] = pg

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Learns by trial and error using REINFORCE. The agent plays episodes, collects rewards, then updates its policy. Toggle headless for faster training.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pg-gamma" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Gamma
            <InfoTooltip description="Discount factor for future rewards. Higher = the agent values long-term survival more." />
          </label>
          <input
            id="pg-gamma"
            type="number"
            step={0.01}
            value={gamma}
            onChange={(e) => setGamma(Number(e.target.value))}
            disabled={state.isTraining}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              state.isTraining && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pg-lr" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Learning Rate
            <InfoTooltip description="Step size for policy updates. Too high can destabilize training." />
          </label>
          <input
            id="pg-lr"
            type="number"
            step={0.0001}
            value={lr}
            onChange={(e) => setLr(Number(e.target.value))}
            disabled={state.isTraining}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              state.isTraining && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pg-episodes" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Episodes / Update
            <InfoTooltip description="Episodes collected before each policy update. More = more stable gradients but slower updates." />
          </label>
          <input
            id="pg-episodes"
            type="number"
            value={episodesPerUpdate}
            onChange={(e) => setEpisodesPerUpdate(Number(e.target.value))}
            disabled={state.isTraining}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              state.isTraining && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pg-updates" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Updates
            <InfoTooltip description="Total number of policy updates to run." />
          </label>
          <input
            id="pg-updates"
            type="number"
            value={updates}
            onChange={(e) => {
              const v = Number(e.target.value)
              setUpdates(v)
              actions.setTargetUpdates?.(v)
            }}
            disabled={state.isTraining}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              state.isTraining && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
      </div>

      <SliderInput
        label="Gradient Clip"
        value={clipGrad}
        min={0.1}
        max={5}
        step={0.1}
        id="pg-clip"
        onChange={setClipGrad}
        disabled={state.isTraining}
        tooltip="Max gradient norm. Clipping stabilizes training."
      />

      <SliderInput
        label="Entropy"
        value={entropyCoef}
        min={0}
        max={0.2}
        step={0.01}
        id="pg-entropy"
        onChange={setEntropyCoef}
        disabled={state.isTraining}
        tooltip="Entropy bonus strength. Higher = more exploration. Set to 0 to disable entropy regularization entirely."
      />

      <SliderInput
        label="Sim Speed"
        value={state.simSpeed}
        min={1}
        max={100}
        step={1}
        id="pg-simspeed"
        onChange={actions.setSimSpeed}
        disabled={isHeadless}
        tooltip={isHeadless ? "Only applies to visual training. Headless runs at max speed." : "Playback speed during visual training. Higher = faster training but harder to watch."}
      />

      <StatBlock label="Best Score" value={state.bestScore} color="text-accent" />
      <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          Avg Return (last 50)
          <InfoTooltip description="Average episode return over the last 50 updates. Higher is better." />
        </span>
        <span className="text-lg font-mono font-semibold tabular-nums text-primary">
          {state.avgReturnLast50 > 0 ? state.avgReturnLast50.toFixed(1) : "—"}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() =>
            state.isTraining
              ? actions.stopTraining()
              : actions.train({
                  episodesPerUpdate,
                  updates,
                  gamma,
                  learningRate: lr,
                  clipGrad,
                  entropyCoef,
                })
          }
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            state.isTraining
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {state.isTraining ? "Stop Training" : (state.model || state.returnHistory.length > 0 ? "Continue Training" : "Train Agent")}
        </button>
        <button
          onClick={() => actions.clearProgress?.()}
          disabled={state.isTraining || (!state.model && state.returnHistory.length === 0)}
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          Clear
        </button>
        <button
          onClick={() => {
            if (!state.isEvaluating) onPolicyGradientEvaluate?.()
            actions.setEvaluating(!state.isEvaluating)
          }}
          disabled={!state.model || state.isTraining}
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            state.model
              ? state.isEvaluating
                ? "border border-accent bg-accent/10 text-accent"
                : "bg-accent text-accent-foreground hover:bg-accent/90"
              : "border border-border bg-card text-card-foreground hover:bg-secondary/80",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {state.isEvaluating ? "Stop" : "Evaluate"}
        </button>
      </div>
    </div>
  )
}

function EvolutionControls({ evolution: ev }: { evolution?: [EvolutionState, EvolutionActions] }) {
  const [populationSize, setPopulationSize] = useState(50)
  const [eliteCount, setEliteCount] = useState(5)
  const [mutationSigma, setMutationSigma] = useState(0.1)
  const [evalSeeds, setEvalSeeds] = useState(5)
  const [generations, setGenerations] = useState(100)

  if (!ev) return null
  const [state, actions] = ev
  const atMaxScore = state.bestFitness >= EVOLUTION_MAX_SCORE
  const configLocked = state.isTraining || state.isEvaluating

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Maintains a population of networks, scores each one on full game runs, then breeds the best performers. No gradients — just survival of the fittest.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ev-pop" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Population
            <InfoTooltip description="Number of networks per generation. Larger = more exploration but slower." />
          </label>
          <input
            id="ev-pop"
            type="number"
            value={populationSize}
            onChange={(e) => setPopulationSize(Math.max(4, Number(e.target.value)))}
            disabled={configLocked}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              configLocked && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ev-elite" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Elites
            <InfoTooltip description="Top performers that survive unchanged to the next generation." />
          </label>
          <input
            id="ev-elite"
            type="number"
            value={eliteCount}
            onChange={(e) => setEliteCount(Math.max(1, Number(e.target.value)))}
            disabled={configLocked}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              configLocked && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ev-seeds" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Eval Seeds
            <InfoTooltip description="How many obstacle layouts each network is tested on. Averaging prevents lucky runs from inflating scores." />
          </label>
          <input
            id="ev-seeds"
            type="number"
            value={evalSeeds}
            onChange={(e) => setEvalSeeds(Math.max(1, Number(e.target.value)))}
            disabled={configLocked}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              configLocked && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ev-gens" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Generations
            <InfoTooltip description="How many generations to run this time. Evolve again adds that many more from the current population; progress shows the cumulative target." />
          </label>
          <input
            id="ev-gens"
            type="number"
            value={generations}
            onChange={(e) => setGenerations(Math.max(1, Number(e.target.value)))}
            disabled={configLocked}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              configLocked && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
      </div>

      <SliderInput
        label="Mutation Sigma"
        value={mutationSigma}
        min={0.01}
        max={0.5}
        step={0.01}
        id="ev-sigma"
        onChange={setMutationSigma}
        disabled={configLocked}
        tooltip="How much noise to add when mutating child weights. Higher explores more, lower fine-tunes."
      />

      <div className="grid grid-cols-2 gap-3">
        <StatBlock label="Best Ever" value={state.bestFitness || "—"} color="text-accent" />
        <StatBlock label="Generation" value={state.generation > 0 ? `${state.generation}/${state.targetGenerations}` : "—"} color="text-accent" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatBlock label="Gen Best" value={state.genBestFitness || "—"} color="text-primary" />
        <StatBlock label="Gen Avg" value={state.avgFitness || "—"} color="text-primary" />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            state.isTraining
              ? actions.stopTraining()
              : actions.train({ populationSize, eliteCount, mutationSigma, generations, evalSeeds })
          }
          disabled={!state.isTraining && (atMaxScore || state.isEvaluating)}
          title={
            atMaxScore && !state.isTraining
              ? "Score cap reached — Clear to start a new run"
              : state.isEvaluating && !state.isTraining
                ? "Stop evaluation first"
                : undefined
          }
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            state.isTraining
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            !state.isTraining && (atMaxScore || state.isEvaluating) && "opacity-50 cursor-not-allowed"
          )}
        >
          {state.isTraining ? "Stop" : atMaxScore ? "Max score" : "Evolve"}
        </button>
        <button
          type="button"
          onClick={actions.clearProgress}
          disabled={state.isTraining || state.isEvaluating || (!state.model && state.generation === 0)}
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => actions.setEvaluating(!state.isEvaluating)}
          disabled={!state.model || state.isTraining}
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            state.model && !state.isTraining
              ? state.isEvaluating
                ? "border border-accent bg-accent/10 text-accent"
                : "bg-accent text-accent-foreground hover:bg-accent/90"
              : "border border-border bg-card text-card-foreground hover:bg-secondary/80",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {state.isEvaluating ? "Stop" : "Evaluate"}
        </button>
      </div>
    </div>
  )
}

function HumanControls({ imitation }: { imitation?: [ImitationState, ImitationActions] }) {
  const [imitState, imitActions] = imitation ?? [undefined, undefined]

  return (
    <div className="flex flex-col gap-4">
      {imitActions && (
        <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              {imitState?.isRecording ? "Recording..." : "Record for Imitation"}
            </span>
            {imitState && imitState.datasetSize > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                {imitState.datasetSize} samples
              </span>
            )}
          </div>
          <button
            onClick={imitActions.toggleRecording}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all",
              imitState?.isRecording
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-accent text-accent-foreground hover:bg-accent/90"
            )}
          >
            {imitState?.isRecording ? "Stop" : "Record"}
          </button>
        </div>
      )}

      <div className="rounded-lg bg-secondary p-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Press{" "}
          <kbd className="inline-flex items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-card-foreground">
            Space
          </kbd>{" "}
          or{" "}
          <kbd className="inline-flex items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-card-foreground">
            ↑
          </kbd>{" "}
          to jump over obstacles. Your score increases the longer you survive. Speed ramps up over time, making it harder. Hit Record above to capture your gameplay as training data for the AI.
        </p>
      </div>

    </div>
  )
}

export function TrainingControls({ activeMode, imitation, policyGradient, evolution, isHeadless, onPolicyGradientEvaluate }: TrainingControlsProps) {
  switch (activeMode) {
    case "imitation":
      return <ImitationControls imitation={imitation} />
    case "policy-gradient":
      return <PolicyGradientControls policyGradient={policyGradient} isHeadless={isHeadless} onPolicyGradientEvaluate={onPolicyGradientEvaluate} />
    case "evolution":
      return <EvolutionControls evolution={evolution} />
    default:
      return <HumanControls imitation={imitation} />
  }
}
