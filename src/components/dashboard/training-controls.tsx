import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { InfoTooltip } from "./info-tooltip"
import type { ImitationState, ImitationActions } from "@/hooks/useImitation"
import type { PolicyGradientState, PolicyGradientActions } from "@/hooks/usePolicyGradient"
import { PG_DEFAULTS } from "@/lib/pg-defaults"
import { EVOLUTION_MAX_SCORE, type EvolutionState, type EvolutionActions } from "@/hooks/useEvolution"
import { parseNumberInput } from "@/lib/sanitize"

interface TrainingControlsProps {
  activeMode: string
  imitation?: [ImitationState, ImitationActions]
  policyGradient?: [PolicyGradientState, PolicyGradientActions]
  evolution?: [EvolutionState, EvolutionActions]
  isHeadless?: boolean
  onHeadlessToggle?: () => void
  headlessToggleDisabled?: boolean
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
        onChange={
          onChange
            ? (e) => onChange(parseNumberInput(e.target.value, min, max, value))
            : undefined
        }
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

function StatBlock({
  label,
  value,
  color = "text-primary",
  info,
}: {
  label: string
  value: string | number
  color?: string
  info?: string
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
      <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
        {label}
        {info ? <InfoTooltip description={info} /> : null}
      </span>
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

const IMITATION_DEFAULTS = { epochs: 100, lr: 0.01, batchSize: 16, threshold: 0.5, thresholdAuto: true }

const EVOLUTION_DEFAULTS = {
  populationSize: 50,
  eliteCount: 5,
  mutationSigma: 0.1,
  evalSeeds: 5,
  generations: 100,
}

function HeadlessTrainingOption({
  isHeadless,
  headlessToggleDisabled,
  onHeadlessToggle,
  suggestHeadless,
}: {
  isHeadless: boolean
  headlessToggleDisabled?: boolean
  onHeadlessToggle: () => void
  suggestHeadless?: boolean
}) {
  const drawAttention = !!suggestHeadless && !isHeadless
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Hides the game view while training so the loop isn’t bound to drawing. Turn it off to watch the agent or run Evaluate.
      </p>
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-shadow duration-300",
          drawAttention
            ? "border-primary/50 bg-primary/10 ring-2 ring-primary/40 ring-offset-2 ring-offset-background motion-safe:animate-pulse"
            : "border-border bg-secondary/50"
        )}
      >
        <span className="text-xs font-semibold text-foreground">Headless</span>
        <button
          type="button"
          onClick={onHeadlessToggle}
          role="switch"
          aria-checked={isHeadless}
          disabled={headlessToggleDisabled}
          aria-label="Headless: no canvas while training"
          className={cn(
            "relative flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full px-0.5 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isHeadless ? "bg-primary" : "bg-secondary",
            headlessToggleDisabled && "cursor-not-allowed opacity-50"
          )}
        >
          <span
            className={cn(
              "block h-4 w-4 rounded-full transition-transform",
              isHeadless ? "translate-x-4 bg-primary-foreground" : "translate-x-0 bg-muted-foreground"
            )}
          />
        </button>
      </div>
    </div>
  )
}

function ResetDefaultsButton({
  visible,
  disabled,
  onClick,
}: {
  visible: boolean
  disabled?: boolean
  onClick: () => void
}) {
  if (!visible) return null
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full rounded-lg border border-border bg-card px-3 py-2 text-[11px] font-semibold text-muted-foreground",
        "hover:bg-secondary hover:text-card-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:opacity-40 disabled:cursor-not-allowed"
      )}
    >
      Reset defaults
    </button>
  )
}

function ImitationControls({ imitation }: { imitation?: [ImitationState, ImitationActions] }) {
  const [epochs, setEpochs] = useState(100)
  const [lr, setLr] = useState(0.01)
  const [batchSize, setBatchSize] = useState(16)
  const [userEditedSettings, setUserEditedSettings] = useState(false)
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
      queueMicrotask(() => {
        setEpochs(e)
        setLr(l)
        setBatchSize(b)
        actions.setThreshold(t)
      })
    }
  }, [state?.datasetSize, state?.datasetBalance.jump, state?.datasetBalance.noop, state, actions])

  if (!state || !actions) return null

  const imitationAtDefaults =
    epochs === IMITATION_DEFAULTS.epochs &&
    lr === IMITATION_DEFAULTS.lr &&
    batchSize === IMITATION_DEFAULTS.batchSize &&
    state.threshold === IMITATION_DEFAULTS.threshold &&
    state.thresholdAuto === IMITATION_DEFAULTS.thresholdAuto

  const controlsBusy = state.isTraining || state.isEvaluating

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    void file
      .text()
      .then((json) => {
        actions.importDataset(json)
        if (fileInputRef.current) fileInputRef.current.value = ""
      })
      .catch(() => {})
  }

  return (
    <div className="flex flex-col gap-4">
      {state.datasetSize === 0 && !state.model && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-semibold text-primary">Step 1:</span> switch to{" "}
            <span className="font-semibold text-card-foreground">Human</span>, enable{" "}
            <span className="font-semibold text-accent">Record</span>, and play a few runs.{" "}
            <span className="font-semibold text-primary">Step 2:</span> return here and train—the model fits jump vs no-jump from what you recorded.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg bg-secondary p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Dataset
            <InfoTooltip description="Each row is one grounded frame: jump (1) or not (0). JSON export/import; Clear removes all samples. With roughly 20+ balanced examples per class we auto-suggest epochs, learning rate, batch size, and jump threshold." />
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
            disabled={controlsBusy}
            className={cn(
              "rounded-md bg-card border border-border px-2.5 py-1 text-[11px] font-medium text-card-foreground hover:bg-secondary/80",
              controlsBusy && "opacity-50 cursor-not-allowed"
            )}
          >
            Import
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          <button
            onClick={actions.clearDataset}
            disabled={state.datasetSize === 0 || controlsBusy}
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
            <InfoTooltip description="How many full passes over the (shuffled) dataset. More epochs can improve fit; training takes longer." />
          </label>
          <input
            id="imit-epochs"
            type="number"
            value={epochs}
            onChange={(e) => {
              setUserEditedSettings(true)
              setEpochs(parseNumberInput(e.target.value, 1, 100_000, epochs))
            }}
            disabled={controlsBusy}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              controlsBusy && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="imit-lr" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Learning Rate
            <InfoTooltip description="Step size for gradient descent on the classification loss. Too large oscillates; too small is slow to converge." />
          </label>
          <input
            id="imit-lr"
            type="number"
            step="0.0001"
            value={lr}
            onChange={(e) => {
              setUserEditedSettings(true)
              setLr(parseNumberInput(e.target.value, 1e-8, 1, lr))
            }}
            disabled={controlsBusy}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              controlsBusy && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="imit-batch" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Batch Size
            <InfoTooltip description="Samples per minibatch before a weight update. Smaller batches noisier; larger batches smoother per step." />
          </label>
          <input
            id="imit-batch"
            type="number"
            value={batchSize}
            onChange={(e) => {
              setUserEditedSettings(true)
              setBatchSize(parseNumberInput(e.target.value, 1, 8192, batchSize))
            }}
            disabled={controlsBusy}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              controlsBusy && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="imit-threshold-auto" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Auto threshold
            <InfoTooltip description="When on, picks a jump threshold after training that maximizes F1 on your saved dataset. When off, you set the cutoff manually." />
          </label>
          <button
            id="imit-threshold-auto"
            role="switch"
            aria-checked={state.thresholdAuto}
            aria-label="Auto jump threshold after training"
            onClick={() => {
              setUserEditedSettings(true)
              actions.setThresholdAuto(!state.thresholdAuto)
            }}
            disabled={controlsBusy}
            className={cn(
              "relative flex h-5 w-9 cursor-pointer items-center rounded-full px-0.5 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              state.thresholdAuto ? "bg-primary" : "bg-secondary",
              controlsBusy && "opacity-50 cursor-not-allowed"
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
          label="Jump cutoff"
          value={state.threshold}
          min={0}
          max={1}
          step={0.01}
          id="imit-threshold"
          onChange={(v) => {
            setUserEditedSettings(true)
            actions.setThreshold(v)
          }}
          disabled={state.thresholdAuto || controlsBusy}
          tooltip="Network outputs P(jump) ∈ [0,1] (sigmoid). When grounded, jump if P is above this threshold. Lower → more jumps; higher → fewer."
        />
      </div>

      <ResetDefaultsButton
        visible={userEditedSettings}
        disabled={controlsBusy}
        onClick={() => {
          if (imitationAtDefaults) {
            setUserEditedSettings(false)
            return
          }
          hasAutoAppliedRef.current = true
          setEpochs(IMITATION_DEFAULTS.epochs)
          setLr(IMITATION_DEFAULTS.lr)
          setBatchSize(IMITATION_DEFAULTS.batchSize)
          actions.setThreshold(IMITATION_DEFAULTS.threshold)
          actions.setThresholdAuto(IMITATION_DEFAULTS.thresholdAuto)
          setUserEditedSettings(false)
        }}
      />

      <div className="flex gap-2">
        <button
          onClick={() => state.isTraining ? actions.stopTraining() : actions.train(epochs, lr, batchSize)}
          disabled={state.isTraining ? false : state.isEvaluating || state.datasetSize === 0}
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            state.isTraining
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {state.isTraining ? "Stop training" : "Train model"}
        </button>
        <button
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

function PolicyGradientControls({
  policyGradient: pg,
  isHeadless,
  onHeadlessToggle,
  headlessToggleDisabled,
  onPolicyGradientEvaluate,
}: {
  policyGradient?: [PolicyGradientState, PolicyGradientActions]
  isHeadless?: boolean
  onHeadlessToggle?: () => void
  headlessToggleDisabled?: boolean
  onPolicyGradientEvaluate?: () => void
}) {
  const [gamma, setGamma] = useState(PG_DEFAULTS.gamma)
  const [gaeLambda, setGaeLambda] = useState(PG_DEFAULTS.gaeLambda)
  const [lr, setLr] = useState(PG_DEFAULTS.lr)
  const [episodesPerUpdate, setEpisodesPerUpdate] = useState(PG_DEFAULTS.episodesPerUpdate)
  const [updates, setUpdates] = useState(PG_DEFAULTS.updates)
  const [clipGrad, setClipGrad] = useState(PG_DEFAULTS.clipGrad)
  const [entropyCoef, setEntropyCoef] = useState(PG_DEFAULTS.entropyCoef)
  const [userEditedSettings, setUserEditedSettings] = useState(false)

  if (!pg) return null
  const [state, actions] = pg
  const controlsBusy = state.isTraining || state.isEvaluating

  const pgAtDefaults =
    gamma === PG_DEFAULTS.gamma &&
    gaeLambda === PG_DEFAULTS.gaeLambda &&
    lr === PG_DEFAULTS.lr &&
    episodesPerUpdate === PG_DEFAULTS.episodesPerUpdate &&
    updates === PG_DEFAULTS.updates &&
    state.targetUpdates === PG_DEFAULTS.updates &&
    clipGrad === PG_DEFAULTS.clipGrad &&
    entropyCoef === PG_DEFAULTS.entropyCoef &&
    state.simSpeed === PG_DEFAULTS.simSpeed &&
    state.threshold === PG_DEFAULTS.jumpThreshold &&
    state.thresholdAuto === PG_DEFAULTS.thresholdAuto &&
    state.evalLogitTemperature === PG_DEFAULTS.evalLogitTemperature &&
    state.rolloutSamplingTemperature === PG_DEFAULTS.rolloutSamplingTemperature

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Actor–critic: the critic estimates returns; the policy updates from advantages (same family as vanilla policy gradient, with lower-variance credit assignment than one-step REINFORCE). The playfield width is fixed at 800px so headless runs match the canvas.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground/90">What to watch:</span> smoother play on <strong className="font-medium text-foreground">Evaluate</strong> / <strong className="font-medium text-foreground">Greedy eval</strong> (deterministic policy with eval spread and τ). During on-screen <strong className="font-medium text-foreground">training</strong>, actions are sampled (rollout temperature). The entropy coefficient anneals linearly toward max(0.002, 18% of your entropy setting) by the final update.
        </p>
      </div>

      {onHeadlessToggle && (
        <HeadlessTrainingOption
          isHeadless={!!isHeadless}
          headlessToggleDisabled={headlessToggleDisabled}
          onHeadlessToggle={onHeadlessToggle}
          suggestHeadless={state.isTraining && !isHeadless}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pg-gamma" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Gamma
            <InfoTooltip description="Discount factor γ for future reward. Near 1 weights distant outcomes; too low and behavior becomes short-sighted." />
          </label>
          <input
            id="pg-gamma"
            type="number"
            step={0.01}
            value={gamma}
            onChange={(e) => {
              setUserEditedSettings(true)
              setGamma(parseNumberInput(e.target.value, 0, 0.9999, gamma))
            }}
            disabled={controlsBusy}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              controlsBusy && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pg-lr" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Learning Rate
            <InfoTooltip description="Learning rate for the policy (actor) network." />
          </label>
          <input
            id="pg-lr"
            type="number"
            step={0.0001}
            value={lr}
            onChange={(e) => {
              setUserEditedSettings(true)
              setLr(parseNumberInput(e.target.value, 1e-8, 1, lr))
            }}
            disabled={controlsBusy}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              controlsBusy && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pg-episodes" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Episodes / Update
            <InfoTooltip description="Episodes rolled out before each policy gradient update. More episodes per update stabilizes the batch estimate but slows how often weights change." />
          </label>
          <input
            id="pg-episodes"
            type="number"
            value={episodesPerUpdate}
            onChange={(e) => {
              setUserEditedSettings(true)
              setEpisodesPerUpdate(parseNumberInput(e.target.value, 1, 500, episodesPerUpdate))
            }}
            disabled={controlsBusy}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              controlsBusy && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pg-updates" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Updates
            <InfoTooltip description="Target policy gradient steps for this run. Stop ends early." />
          </label>
          <input
            id="pg-updates"
            type="number"
            value={updates}
            onChange={(e) => {
              setUserEditedSettings(true)
              const v = parseNumberInput(e.target.value, 1, 1_000_000, updates)
              setUpdates(v)
              actions.setTargetUpdates?.(v)
            }}
            disabled={controlsBusy}
            className={cn(
              "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
              "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              controlsBusy && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 min-[480px]:gap-3">
        <div className="min-w-0">
          <SliderInput
            label="GAE λ"
            value={gaeLambda}
            min={0.9}
            max={0.99}
            step={0.01}
            id="pg-gae-lambda"
            onChange={(v) => {
              setUserEditedSettings(true)
              setGaeLambda(v)
            }}
            disabled={controlsBusy}
            tooltip="GAE λ: higher values weight longer returns (more like Monte Carlo); lower values rely more on the critic (more like TD). Bias–variance tradeoff."
          />
        </div>
        <div className="min-w-0">
          <SliderInput
            label="Gradient Clip"
            value={clipGrad}
            min={0.1}
            max={5}
            step={0.1}
            id="pg-clip"
            onChange={(v) => {
              setUserEditedSettings(true)
              setClipGrad(v)
            }}
            disabled={controlsBusy}
            tooltip="Per-layer gradient norm clip so a single batch cannot overshoot the update."
          />
        </div>
        <div className="min-w-0">
          <SliderInput
            label="Entropy"
            value={entropyCoef}
            min={0}
            max={0.2}
            step={0.01}
            id="pg-entropy"
            onChange={(v) => {
              setUserEditedSettings(true)
              setEntropyCoef(v)
            }}
            disabled={controlsBusy}
            tooltip="Entropy regularization; encourages exploration early. Anneals linearly from this value down to max(0.002, 18% of it) by the final update. Zero disables the bonus."
          />
        </div>
        <div className="min-w-0">
          <SliderInput
            label="Rollout temp"
            value={state.rolloutSamplingTemperature}
            min={1}
            max={2.5}
            step={0.05}
            id="pg-rollout-temp"
            onChange={(v) => {
              setUserEditedSettings(true)
              actions.setRolloutSamplingTemperature(v)
            }}
            disabled={controlsBusy}
            tooltip="Training-time sampling only: jump probability is σ(logit / T). T &gt; 1 pulls probabilities toward 0.5. Evaluate and greedy eval use eval spread and τ below, not this control."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 min-[480px]:gap-3">
        <div className="min-w-0">
          <SliderInput
            label="Sim Speed"
            value={state.simSpeed}
            min={1}
            max={100}
            step={1}
            id="pg-simspeed"
            onChange={(v) => {
              setUserEditedSettings(true)
              actions.setSimSpeed(v)
            }}
            disabled={isHeadless || controlsBusy}
            tooltip={isHeadless ? "Unavailable while headless; the sim runs without rendering." : "Speed multiplier for the simulation loop when the canvas is visible."}
          />
        </div>
        <div className="min-w-0">
          <SliderInput
            label="Eval spread"
            value={state.evalLogitTemperature}
            min={1}
            max={12}
            step={0.25}
            id="pg-eval-spread"
            onChange={(v) => {
              setUserEditedSettings(true)
              actions.setEvalLogitTemperature(v)
            }}
            disabled={controlsBusy}
            tooltip="Evaluate and Greedy eval only: linearly pulls P(jump) toward 0.5 before thresholding (spread = 1 is a no-op). Larger values soften decisions. Training rollouts use rollout temperature above."
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Auto jump τ
            <InfoTooltip description="After each update, searches a small τ grid for the highest mean greedy score; ties prefer higher τ (fewer jumps). Off: set τ manually below." />
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={state.thresholdAuto}
            disabled={controlsBusy}
            onClick={() => {
              setUserEditedSettings(true)
              actions.setThresholdAuto(!state.thresholdAuto)
            }}
            className={cn(
              "relative flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full px-0.5 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              state.thresholdAuto ? "bg-primary" : "bg-secondary",
              controlsBusy && "cursor-not-allowed opacity-50",
            )}
          >
            <span
              className={cn(
                "block h-4 w-4 rounded-full transition-transform",
                state.thresholdAuto ? "translate-x-4 bg-primary-foreground" : "translate-x-0 bg-muted-foreground",
              )}
            />
          </button>
        </div>
        {!state.thresholdAuto && (
          <SliderInput
            label="Jump threshold"
            value={state.threshold}
            min={0.1}
            max={0.95}
            step={0.05}
            id="pg-jump-threshold"
            onChange={(v) => {
              setUserEditedSettings(true)
              actions.setThreshold(v)
            }}
            disabled={controlsBusy}
            tooltip="Greedy eval: jump when grounded and P(jump) clears this bar."
          />
        )}
      </div>

      <StatBlock
        label="Best Score"
        value={state.bestScore}
        color="text-accent"
        info="Peak episode distance this session, updated after each policy batch. Clear resets training progress."
      />
      <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          Avg score (last 50)
          <InfoTooltip description="Rolling mean episode distance over the last 50 updates (mean score per batch of rollouts). Uses distance so very short episodes don’t dominate." />
        </span>
        <span className="text-lg font-mono font-semibold tabular-nums text-primary">
          {state.returnHistory.length > 0 ? state.avgReturnLast50.toFixed(1) : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          Greedy eval (last 50)
          <InfoTooltip description="Rolling mean greedy-eval distance over the last 50 updates (fixed seeds; τ from Auto jump τ or manual). Smoother than the stochastic training curve." />
        </span>
        <span className="text-lg font-mono font-semibold tabular-nums text-primary">
          {state.greedyEvalHistory.length > 0 ? state.greedyAvgLast50.toFixed(1) : "—"}
        </span>
      </div>

      <ResetDefaultsButton
        visible={userEditedSettings}
        disabled={controlsBusy}
        onClick={() => {
          if (pgAtDefaults) {
            setUserEditedSettings(false)
            return
          }
          setGamma(PG_DEFAULTS.gamma)
          setGaeLambda(PG_DEFAULTS.gaeLambda)
          setLr(PG_DEFAULTS.lr)
          setEpisodesPerUpdate(PG_DEFAULTS.episodesPerUpdate)
          setUpdates(PG_DEFAULTS.updates)
          actions.setTargetUpdates(PG_DEFAULTS.updates)
          setClipGrad(PG_DEFAULTS.clipGrad)
          setEntropyCoef(PG_DEFAULTS.entropyCoef)
          actions.setSimSpeed(PG_DEFAULTS.simSpeed)
          actions.setThreshold(PG_DEFAULTS.jumpThreshold)
          actions.setThresholdAuto(PG_DEFAULTS.thresholdAuto)
          actions.setEvalLogitTemperature(PG_DEFAULTS.evalLogitTemperature)
          actions.setRolloutSamplingTemperature(PG_DEFAULTS.rolloutSamplingTemperature)
          setUserEditedSettings(false)
        }}
      />

      <div className="flex gap-2">
        <button
          onClick={() =>
            state.isTraining
              ? actions.stopTraining()
              : actions.train({
                  episodesPerUpdate,
                  updates,
                  gamma,
                  gaeLambda,
                  learningRate: lr,
                  clipGrad,
                  entropyCoef,
                  jumpThreshold: state.threshold,
                  jumpThresholdAuto: state.thresholdAuto,
                  evalLogitTemperature: state.evalLogitTemperature,
                  rolloutSamplingTemperature: state.rolloutSamplingTemperature,
                })
          }
          disabled={!state.isTraining && state.isEvaluating}
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            state.isTraining
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {state.isTraining
            ? "Stop training"
            : state.model || state.returnHistory.length > 0 || state.greedyEvalHistory.length > 0
              ? "Keep training"
              : "Start training"}
        </button>
        <button
          onClick={() => actions.clearProgress?.()}
          disabled={
            controlsBusy ||
            (!state.model && state.returnHistory.length === 0 && state.greedyEvalHistory.length === 0)
          }
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

function EvolutionControls({
  evolution: ev,
  isHeadless,
  onHeadlessToggle,
  headlessToggleDisabled,
}: {
  evolution?: [EvolutionState, EvolutionActions]
  isHeadless?: boolean
  onHeadlessToggle?: () => void
  headlessToggleDisabled?: boolean
}) {
  const [populationSize, setPopulationSize] = useState(50)
  const [eliteCount, setEliteCount] = useState(5)
  const [mutationSigma, setMutationSigma] = useState(0.1)
  const [evalSeeds, setEvalSeeds] = useState(5)
  const [generations, setGenerations] = useState(100)
  const [userEditedSettings, setUserEditedSettings] = useState(false)

  if (!ev) return null
  const [state, actions] = ev
  const atMaxScore = state.bestFitness >= EVOLUTION_MAX_SCORE
  const configLocked = state.isTraining || state.isEvaluating

  const evoAtDefaults =
    populationSize === EVOLUTION_DEFAULTS.populationSize &&
    eliteCount === EVOLUTION_DEFAULTS.eliteCount &&
    mutationSigma === EVOLUTION_DEFAULTS.mutationSigma &&
    evalSeeds === EVOLUTION_DEFAULTS.evalSeeds &&
    generations === EVOLUTION_DEFAULTS.generations

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Each network is scored on full game runs; top performers are kept as elites and the rest of the population is filled with mutated offspring. No gradients—mutation and selection only.
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground/90 leading-snug">
          Stopping mid-run keeps the population and generation count. Use Evolve or Continue to add more generations when population size matches your settings. Change population size or Clear to start over.
        </p>
      </div>

      {onHeadlessToggle && (
        <HeadlessTrainingOption
          isHeadless={!!isHeadless}
          headlessToggleDisabled={headlessToggleDisabled}
          onHeadlessToggle={onHeadlessToggle}
          suggestHeadless={state.isTraining && !isHeadless}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ev-pop" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            Population
            <InfoTooltip description="Individuals per generation. Larger populations explore more but take longer per generation." />
          </label>
          <input
            id="ev-pop"
            type="number"
            value={populationSize}
            onChange={(e) => {
              setUserEditedSettings(true)
              const next = Math.max(4, parseNumberInput(e.target.value, 4, 5000, populationSize))
              setPopulationSize(next)
              setEliteCount((c) => Math.min(c, next))
            }}
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
            <InfoTooltip description="How many top individuals are copied unchanged into the next generation." />
          </label>
          <input
            id="ev-elite"
            type="number"
            value={eliteCount}
            onChange={(e) => {
              setUserEditedSettings(true)
              const raw = parseNumberInput(e.target.value, 1, populationSize, eliteCount)
              setEliteCount(Math.min(Math.max(1, raw), populationSize))
            }}
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
            <InfoTooltip description="Fitness = mean score across random seeds so one easy layout can’t carry the whole genome." />
          </label>
          <input
            id="ev-seeds"
            type="number"
            value={evalSeeds}
            onChange={(e) => {
              setUserEditedSettings(true)
              setEvalSeeds(parseNumberInput(e.target.value, 1, 200, evalSeeds))
            }}
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
            <InfoTooltip description="Generations to run in this session. Evolve again continues from the saved population." />
          </label>
          <input
            id="ev-gens"
            type="number"
            value={generations}
            onChange={(e) => {
              setUserEditedSettings(true)
              setGenerations(parseNumberInput(e.target.value, 1, 1_000_000, generations))
            }}
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
        onChange={(v) => {
          setUserEditedSettings(true)
          setMutationSigma(v)
        }}
        disabled={configLocked}
        tooltip="Gaussian noise std. dev. on weights when creating offspring. Higher σ explores more; lower σ refines around current solutions."
      />

      <ResetDefaultsButton
        visible={userEditedSettings}
        disabled={configLocked}
        onClick={() => {
          if (evoAtDefaults) {
            setUserEditedSettings(false)
            return
          }
          setPopulationSize(EVOLUTION_DEFAULTS.populationSize)
          setEliteCount(EVOLUTION_DEFAULTS.eliteCount)
          setMutationSigma(EVOLUTION_DEFAULTS.mutationSigma)
          setEvalSeeds(EVOLUTION_DEFAULTS.evalSeeds)
          setGenerations(EVOLUTION_DEFAULTS.generations)
          setUserEditedSettings(false)
        }}
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
              ? "Maximum fitness reached—use Clear to reset"
              : state.isEvaluating && !state.isTraining
                ? "Stop the eval first"
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
          {state.isTraining
            ? "Stop"
            : atMaxScore
              ? "At cap"
              : state.generation > 0
                ? "Continue"
                : "Evolve"}
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
              {imitState?.isRecording ? "Recording…" : "Record for imitation"}
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
          Use{" "}
          <kbd className="inline-flex items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-card-foreground">
            Space
          </kbd>{" "}
          or{" "}
          <kbd className="inline-flex items-center justify-center rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-card-foreground">
            ↑
          </kbd>{" "}
          to jump. Score ticks up the longer you stay alive, and the run slowly speeds up. Toggle Record when you want frames saved for the imitation learner.
        </p>
      </div>

    </div>
  )
}

export function TrainingControls({
  activeMode,
  imitation,
  policyGradient,
  evolution,
  isHeadless,
  onHeadlessToggle,
  headlessToggleDisabled,
  onPolicyGradientEvaluate,
}: TrainingControlsProps) {
  switch (activeMode) {
    case "imitation":
      return <ImitationControls imitation={imitation} />
    case "policy-gradient":
      return (
        <PolicyGradientControls
          policyGradient={policyGradient}
          isHeadless={isHeadless}
          onHeadlessToggle={onHeadlessToggle}
          headlessToggleDisabled={headlessToggleDisabled}
          onPolicyGradientEvaluate={onPolicyGradientEvaluate}
        />
      )
    case "evolution":
      return (
        <EvolutionControls
          evolution={evolution}
          isHeadless={isHeadless}
          onHeadlessToggle={onHeadlessToggle}
          headlessToggleDisabled={headlessToggleDisabled}
        />
      )
    default:
      return <HumanControls imitation={imitation} />
  }
}
