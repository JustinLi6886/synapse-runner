import { cn } from "@/lib/utils"
import { ChartContainer } from "./chart-container"
import { mockState, lossData, returnData, fitnessData } from "@/lib/mock-data"

interface TrainingControlsProps {
  activeMode: string
  scoreHistory?: { name: string; value: number }[]
}

function SliderInput({
  label,
  value,
  min,
  max,
  step,
  id,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  id: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground">
          {label}
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
        defaultValue={value}
        aria-label={label}
        className={cn(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary",
          "accent-primary",
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

function NumberInput({ label, value, id }: { label: string; value: number | string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        defaultValue={value}
        aria-label={label}
        className={cn(
          "rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-mono text-card-foreground tabular-nums",
          "transition-colors",
          "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
          "placeholder:text-muted-foreground/50"
        )}
      />
    </div>
  )
}

function TrainButton({ label }: { label: string }) {
  return (
    <button
      aria-label={label}
      className={cn(
        "w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground",
        "transition-all",
        "hover:bg-primary/90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "active:scale-[0.98]"
      )}
    >
      {label}
    </button>
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

function ToggleSwitch({ label, checked, id }: { label: string; checked: boolean; id: string }) {
  return (
    <div className="flex items-center justify-between">
      <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={cn(
          "relative flex h-5 w-9 cursor-pointer items-center rounded-full px-0.5 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          checked ? "bg-primary" : "bg-secondary"
        )}
      >
        <div
          className={cn(
            "h-4 w-4 rounded-full bg-foreground transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    </div>
  )
}

function ImitationControls() {
  const { imitation } = mockState.training
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Epochs" value={imitation.epochs} id="epochs" />
        <NumberInput label="Learning Rate" value={imitation.learningRate} id="imitation-lr" />
      </div>
      <SliderInput label="Threshold" value={imitation.threshold} min={0} max={1} step={0.01} id="threshold" />
      <TrainButton label="Train Model" />
      <ChartContainer data={lossData} label="Training Loss" color="var(--primary)" />
    </div>
  )
}

function PolicyGradientControls() {
  const { policyGradient } = mockState.training
  return (
    <div className="flex flex-col gap-4">
      <SliderInput label="Gamma (Discount)" value={policyGradient.gamma} min={0.9} max={1} step={0.01} id="gamma" />
      <SliderInput label="Learning Rate" value={policyGradient.learningRate} min={0.0001} max={0.01} step={0.0001} id="pg-lr" />
      <ToggleSwitch label="Entropy Regularization" checked={policyGradient.entropyRegEnabled} id="entropy-reg" />
      <StatBlock label="Best Score" value={policyGradient.bestScore} color="text-accent" />
      <TrainButton label="Train Agent" />
      <ChartContainer data={returnData} label="Average Return" color="var(--accent)" />
    </div>
  )
}

function EvolutionControls() {
  const { evolution } = mockState.training
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Population Size" value={evolution.populationSize} id="pop-size" />
        <NumberInput label="Elite Count" value={evolution.eliteCount} id="elite-count" />
      </div>
      <SliderInput label="Mutation Sigma" value={evolution.mutationSigma} min={0.01} max={0.5} step={0.01} id="mutation-sigma" />
      <StatBlock label="Generation" value={evolution.generation} color="text-primary" />
      <TrainButton label="Evolve" />
      <ChartContainer data={fitnessData} label="Best Fitness" color="var(--chart-2)" />
    </div>
  )
}

function HumanControls({ scoreHistory }: { scoreHistory?: { name: string; value: number }[] }) {
  return (
    <div className="flex flex-col gap-4">
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
          to jump. The agent observes obstacle distance, width, height, player
          Y position, velocity, and game speed.
        </p>
      </div>
      {scoreHistory && scoreHistory.length > 0 ? (
        <ChartContainer data={scoreHistory} label="Score History" color="var(--primary)" />
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Score History
          </span>
          <div className="flex h-[140px] items-center justify-center rounded-md border border-dashed border-border">
            <span className="text-xs text-muted-foreground">No runs yet</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function TrainingControls({ activeMode, scoreHistory }: TrainingControlsProps) {
  switch (activeMode) {
    case "imitation":
      return <ImitationControls />
    case "policy-gradient":
      return <PolicyGradientControls />
    case "evolution":
      return <EvolutionControls />
    default:
      return <HumanControls scoreHistory={scoreHistory} />
  }
}
