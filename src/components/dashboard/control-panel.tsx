import { DashboardCard } from "./dashboard-card"
import { ModeSelector } from "./mode-selector"
import { TrainingControls } from "./training-controls"
import type { ImitationState, ImitationActions } from "@/hooks/useImitation"
import type { PolicyGradientState, PolicyGradientActions } from "@/hooks/usePolicyGradient"
import type { EvolutionState, EvolutionActions } from "@/hooks/useEvolution"

interface ControlPanelProps {
  activeMode: string
  onModeChange: (mode: string) => void
  modeLocked?: boolean
  imitation?: [ImitationState, ImitationActions]
  policyGradient?: [PolicyGradientState, PolicyGradientActions]
  evolution?: [EvolutionState, EvolutionActions]
  isHeadless?: boolean
  onHeadlessToggle?: () => void
  headlessToggleDisabled?: boolean
  onPolicyGradientEvaluate?: () => void
}

const modeLabels: Record<string, string> = {
  human: "Human",
  imitation: "Imitation",
  "policy-gradient": "Policy gradient",
  evolution: "Evolution",
}

export function ControlPanel({
  activeMode,
  onModeChange,
  modeLocked,
  imitation,
  policyGradient,
  evolution,
  isHeadless,
  onHeadlessToggle,
  headlessToggleDisabled,
  onPolicyGradientEvaluate,
}: ControlPanelProps) {
  return (
    <nav className="flex flex-col gap-4" aria-label="Modes and training">
      <DashboardCard title="Mode">
        <ModeSelector activeMode={activeMode} onModeChange={onModeChange} modeLocked={modeLocked} />
      </DashboardCard>

      <DashboardCard title={activeMode === "human" ? "Play & capture" : `Train — ${modeLabels[activeMode]}`}>
        <TrainingControls
          activeMode={activeMode}
          imitation={imitation}
          policyGradient={policyGradient}
          evolution={evolution}
          isHeadless={isHeadless}
          onHeadlessToggle={onHeadlessToggle}
          headlessToggleDisabled={headlessToggleDisabled}
          onPolicyGradientEvaluate={onPolicyGradientEvaluate}
        />
      </DashboardCard>
    </nav>
  )
}
