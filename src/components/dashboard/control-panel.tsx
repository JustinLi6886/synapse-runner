import { DashboardCard } from "./dashboard-card"
import { ModeSelector } from "./mode-selector"
import { TrainingControls } from "./training-controls"
import type { HumanLiveMetrics } from "./game-panel"
import type { ImitationState, ImitationActions } from "@/hooks/useImitation"
import type { PolicyGradientState, PolicyGradientActions } from "@/hooks/usePolicyGradient"

interface ControlPanelProps {
  activeMode: string
  onModeChange: (mode: string) => void
  liveMetrics?: HumanLiveMetrics | null
  imitation?: [ImitationState, ImitationActions]
  policyGradient?: [PolicyGradientState, PolicyGradientActions]
  isHeadless?: boolean
  onPolicyGradientEvaluate?: () => void
}

const modeLabels: Record<string, string> = {
  human: "Human",
  imitation: "Imitation Learning",
  "policy-gradient": "Policy Gradient (RL)",
  evolution: "Evolution Strategy",
}

export function ControlPanel({ activeMode, onModeChange, liveMetrics, imitation, policyGradient, isHeadless, onPolicyGradientEvaluate }: ControlPanelProps) {
  return (
    <nav className="flex flex-col gap-4" aria-label="AI Lab controls">
      <DashboardCard title="Mode">
        <ModeSelector activeMode={activeMode} onModeChange={onModeChange} />
      </DashboardCard>

      <DashboardCard title={activeMode === "human" ? "Human Agent" : `Training -- ${modeLabels[activeMode]}`}>
        <TrainingControls activeMode={activeMode} scoreHistory={liveMetrics?.scoreHistory} imitation={imitation} policyGradient={policyGradient} isHeadless={isHeadless} onPolicyGradientEvaluate={onPolicyGradientEvaluate} />
      </DashboardCard>
    </nav>
  )
}
