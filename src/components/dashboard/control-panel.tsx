import { DashboardCard } from "./dashboard-card"
import { ModeSelector } from "./mode-selector"
import { TrainingControls } from "./training-controls"
import { MetricTile } from "./metric-tile"
import { mockState } from "@/lib/mock-data"
import type { HumanLiveMetrics } from "./game-panel"

interface ControlPanelProps {
  activeMode: string
  onModeChange: (mode: string) => void
  liveMetrics?: HumanLiveMetrics | null
}

const modeLabels: Record<string, string> = {
  human: "Human",
  imitation: "Imitation Learning",
  "policy-gradient": "Policy Gradient (RL)",
  evolution: "Evolution Strategy",
}

export function ControlPanel({ activeMode, onModeChange, liveMetrics }: ControlPanelProps) {
  const { metrics } = mockState
  const m = activeMode === "human" && liveMetrics ? liveMetrics : metrics

  return (
    <nav className="flex flex-col gap-4" aria-label="AI Lab controls">
      <DashboardCard title="Mode">
        <ModeSelector activeMode={activeMode} onModeChange={onModeChange} />
      </DashboardCard>

      <DashboardCard title={activeMode === "human" ? "Human Agent" : `Training -- ${modeLabels[activeMode]}`}>
        <TrainingControls activeMode={activeMode} scoreHistory={liveMetrics?.scoreHistory} />
      </DashboardCard>

      {activeMode !== "human" && (
        <DashboardCard title="Live Metrics">
          <div className="grid grid-cols-3 gap-3">
            <MetricTile label="Score" value={m.score} highlight />
            <MetricTile label="Best" value={m.bestScore} />
            <MetricTile label="Episode" value={m.episode} />
            <MetricTile label="Speed" value={m.speed} unit="x" />
            <MetricTile label="Jump P" value={m.jumpProb} />
            <MetricTile label="Action" value={m.action} />
          </div>
        </DashboardCard>
      )}
    </nav>
  )
}
