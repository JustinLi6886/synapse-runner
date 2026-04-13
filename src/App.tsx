import { useState, useEffect } from "react"
import { TopNav } from "@/components/dashboard/top-nav"
import { ControlPanel } from "@/components/dashboard/control-panel"
import { GamePanel } from "@/components/dashboard/game-panel"
import { mockState } from "@/lib/mock-data"
import { useImitation } from "@/hooks/useImitation"
import { usePolicyGradient } from "@/hooks/usePolicyGradient"
import { useEvolution } from "@/hooks/useEvolution"
import { getPersisted, schedulePersist, flushPersist } from "@/lib/app-persist"

const VALID_MODES = ["human", "imitation", "policy-gradient", "evolution"] as const
type AppMode = (typeof VALID_MODES)[number]

function sanitizeMode(raw: string | undefined): AppMode {
  if (raw && (VALID_MODES as readonly string[]).includes(raw)) return raw as AppMode
  return "human"
}

function sanitizeBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback
}

function App() {
  const ui0 = getPersisted()?.ui
  const [activeMode, setActiveMode] = useState<AppMode>(() =>
    sanitizeMode(ui0?.activeMode ?? mockState.activeMode),
  )
  const [headlessPolicyGradient, setHeadlessPolicyGradient] = useState(
    () => sanitizeBool(ui0?.headlessPolicyGradient, mockState.isHeadless),
  )
  const [headlessEvolution, setHeadlessEvolution] = useState(() =>
    sanitizeBool(ui0?.headlessEvolution, mockState.isHeadless),
  )
  const [leftPanelOpen, setLeftPanelOpen] = useState(() =>
    sanitizeBool(ui0?.leftPanelOpen, true),
  )
  const imitation = useImitation()
  const policyGradient = usePolicyGradient(headlessPolicyGradient)
  const evolution = useEvolution(headlessEvolution)

  const isHeadlessForUi =
    activeMode === "policy-gradient"
      ? headlessPolicyGradient
      : activeMode === "evolution"
        ? headlessEvolution
        : false

  useEffect(() => {
    schedulePersist({
      ui: {
        activeMode,
        headlessPolicyGradient,
        headlessEvolution,
        leftPanelOpen,
      },
    })
  }, [activeMode, headlessPolicyGradient, headlessEvolution, leftPanelOpen])

  useEffect(() => {
    const onUnload = () => flushPersist()
    window.addEventListener("beforeunload", onUnload)
    return () => window.removeEventListener("beforeunload", onUnload)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      <TopNav
        activeMode={activeMode}
        isHeadless={isHeadlessForUi}
        onHeadlessToggle={() => {
          if (activeMode === "policy-gradient") {
            if (policyGradient[0]?.isTraining) {
              if (headlessPolicyGradient) {
                policyGradient[1]?.switchHeadlessAndRestart?.()
                setHeadlessPolicyGradient(false)
              } else {
                policyGradient[1]?.setEvaluating?.(false)
                policyGradient[1]?.switchHeadlessAndRestart?.(() => setHeadlessPolicyGradient(true))
              }
            } else {
              if (!headlessPolicyGradient) policyGradient[1]?.setEvaluating?.(false)
              setHeadlessPolicyGradient((h) => !h)
            }
          } else if (activeMode === "evolution") {
            setHeadlessEvolution((h) => !h)
          }
        }}
        leftPanelOpen={leftPanelOpen}
        onLeftPanelToggle={() => setLeftPanelOpen(!leftPanelOpen)}
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
              onModeChange={(mode) => setActiveMode(sanitizeMode(mode))}
              imitation={imitation}
              policyGradient={policyGradient}
              evolution={evolution}
              isHeadless={isHeadlessForUi}
              onPolicyGradientEvaluate={() => {
                if (headlessPolicyGradient) setHeadlessPolicyGradient(false)
              }}
            />
          </div>
        </aside>

        <main className="flex flex-1 flex-col min-h-0 min-w-0 overflow-y-auto p-4">
          <GamePanel
            activeMode={activeMode}
            isHeadless={isHeadlessForUi}
            imitation={imitation}
            policyGradient={policyGradient}
            evolution={evolution}
          />
        </main>
      </div>
    </div>
  )
}

export default App
