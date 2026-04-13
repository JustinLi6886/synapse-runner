import { DashboardCard } from "./dashboard-card"
import { ModeSelector } from "./mode-selector"
import { TrainingControls } from "./training-controls"
import type { ImitationState, ImitationActions } from "@/hooks/useImitation"
import type { PolicyGradientState, PolicyGradientActions } from "@/hooks/usePolicyGradient"
import type { EvolutionState, EvolutionActions } from "@/hooks/useEvolution"

interface ControlPanelProps {
  activeMode: string
  onModeChange: (mode: string) => void
  imitation?: [ImitationState, ImitationActions]
  policyGradient?: [PolicyGradientState, PolicyGradientActions]
  evolution?: [EvolutionState, EvolutionActions]
  isHeadless?: boolean
  onPolicyGradientEvaluate?: () => void
}

const modeLabels: Record<string, string> = {
  human: "Human",
  imitation: "Imitation Learning",
  "policy-gradient": "Policy Gradient (RL)",
  evolution: "Evolution Strategy",
}

export function ControlPanel({ activeMode, onModeChange, imitation, policyGradient, evolution, isHeadless, onPolicyGradientEvaluate }: ControlPanelProps) {
  return (
    <nav className="flex flex-col gap-4" aria-label="AI Lab controls">
      <DashboardCard title="Mode">
        <ModeSelector activeMode={activeMode} onModeChange={onModeChange} />
      </DashboardCard>

      <DashboardCard title={activeMode === "human" ? "Human Agent" : `Training — ${modeLabels[activeMode]}`}>
        <TrainingControls activeMode={activeMode} imitation={imitation} policyGradient={policyGradient} evolution={evolution} isHeadless={isHeadless} onPolicyGradientEvaluate={onPolicyGradientEvaluate} />
      </DashboardCard>
    </nav>
  )
}
