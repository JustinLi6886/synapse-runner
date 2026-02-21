import { useState } from "react"
import { TopNav } from "@/components/dashboard/top-nav"
import { ControlPanel } from "@/components/dashboard/control-panel"
import { GamePanel } from "@/components/dashboard/game-panel"
import { mockState } from "@/lib/mock-data"
import type { HumanLiveMetrics } from "@/components/dashboard/game-panel"

function App() {
  const [activeMode, setActiveMode] = useState(mockState.activeMode)
  const [isHeadless, setIsHeadless] = useState(mockState.isHeadless)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [humanMetrics, setHumanMetrics] = useState<HumanLiveMetrics | null>(null)

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      <TopNav
        isHeadless={isHeadless}
        onHeadlessToggle={() => setIsHeadless(!isHeadless)}
        leftPanelOpen={leftPanelOpen}
        onLeftPanelToggle={() => setLeftPanelOpen(!leftPanelOpen)}
        seed={humanMetrics?.seed ?? null}
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
            />
          </div>
        </aside>

        <main className="flex flex-1 flex-col min-h-0 min-w-0 overflow-y-auto p-4">
          <GamePanel
          activeMode={activeMode}
          isHeadless={isHeadless}
          onHumanMetricsChange={activeMode === "human" ? setHumanMetrics : undefined}
        />
        </main>
      </div>
    </div>
  )
}

export default App
