import { useState } from "react"
import { TopNav } from "@/components/dashboard/top-nav"
import { ControlPanel } from "@/components/dashboard/control-panel"
import { GamePanel } from "@/components/dashboard/game-panel"
import { mockState } from "@/lib/mock-data"
import { useImitation } from "@/hooks/useImitation"
import { usePolicyGradient } from "@/hooks/usePolicyGradient"
import type { HumanLiveMetrics } from "@/components/dashboard/game-panel"

function App() {
  const [activeMode, setActiveMode] = useState(mockState.activeMode)
  const [isHeadless, setIsHeadless] = useState(mockState.isHeadless)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [humanMetrics, setHumanMetrics] = useState<HumanLiveMetrics | null>(null)
  const imitation = useImitation()
  const policyGradient = usePolicyGradient(isHeadless)

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      <TopNav
        activeMode={activeMode}
        isHeadless={isHeadless}
        onHeadlessToggle={() => {
          if (policyGradient[0]?.isTraining) {
            if (isHeadless) {
              policyGradient[1]?.switchHeadlessAndRestart?.()
              setIsHeadless(false)
            } else {
              policyGradient[1]?.setEvaluating?.(false)
              policyGradient[1]?.switchHeadlessAndRestart?.(() => setIsHeadless(true))
            }
          } else {
            if (!isHeadless) policyGradient[1]?.setEvaluating?.(false)
            setIsHeadless(!isHeadless)
          }
        }}
        leftPanelOpen={leftPanelOpen}
        onLeftPanelToggle={() => setLeftPanelOpen(!leftPanelOpen)}
        seed={humanMetrics?.seed ?? null}
        imitation={imitation}
        policyGradient={policyGradient}
      />

      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`shrink-0 overflow-y-auto border-r border-border transition-[width] duration-200 ease-in-out ${
            leftPanelOpen ? "w-[420px] min-[1024px]:w-[380px] min-[1280px]:w-[420px]" : "w-0"
          }`}
        >
          <div className="w-[420px] min-[1024px]:w-[380px] min-[1280px]:w-[420px] p-4">
            <ControlPanel
              activeMode={activeMode}
              onModeChange={setActiveMode}
              liveMetrics={activeMode === "human" ? humanMetrics : null}
              imitation={imitation}
              policyGradient={policyGradient}
              isHeadless={isHeadless}
              onPolicyGradientEvaluate={() => {
                if (isHeadless) setIsHeadless(false)
              }}
            />
          </div>
        </aside>

        <main className="flex flex-1 flex-col min-h-0 min-w-0 overflow-y-auto p-4">
          <GamePanel
            activeMode={activeMode}
            isHeadless={isHeadless}
            onHumanMetricsChange={activeMode === "human" ? setHumanMetrics : undefined}
            imitation={imitation}
            policyGradient={policyGradient}
          />
        </main>
      </div>
    </div>
  )
}

export default App
