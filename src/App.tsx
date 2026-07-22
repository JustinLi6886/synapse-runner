import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import { TopNav } from "@/components/dashboard/top-nav"
import { ControlPanel } from "@/components/dashboard/control-panel"
import { GamePanel } from "@/components/dashboard/game-panel"
import { mockState } from "@/lib/mock-data"
import { useImitation } from "@/hooks/useImitation"
import { usePolicyGradient } from "@/hooks/usePolicyGradient"
import { useEvolution } from "@/hooks/useEvolution"
import { getPersisted, schedulePersist, flushPersist } from "@/lib/app-persist"
import { ToastViewport } from "@/components/toast-viewport"
import { NarrowViewportGate } from "@/components/narrow-viewport-gate"
import { useNarrowViewportBlocked } from "@/hooks/useNarrowViewportBlocked"
import { sanitizeAppMode, sanitizeBool, sanitizeTheme, type AppMode } from "@/lib/sanitize"

function animateLeftPanelScrollToBottom(el: HTMLElement, durationMs: number): () => void {
  let rafId = 0
  let cancelled = false
  const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

  const run = () => {
    if (cancelled) return
    const maxTop = Math.max(0, el.scrollHeight - el.clientHeight)
    const from = el.scrollTop
    const delta = maxTop - from
    if (delta <= 1) return

    const t0 = performance.now()
    const step = (now: number) => {
      if (cancelled) return
      const u = Math.min(1, (now - t0) / durationMs)
      el.scrollTop = from + delta * easeOutCubic(u)
      if (u < 1) rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
  }

  rafId = requestAnimationFrame(() => {
    rafId = requestAnimationFrame(run)
  })

  return () => {
    cancelled = true
    cancelAnimationFrame(rafId)
  }
}

function App() {
  const ui0 = getPersisted()?.ui
  const [activeMode, setActiveMode] = useState<AppMode>(() =>
    sanitizeAppMode(ui0?.activeMode ?? mockState.activeMode),
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
  const [theme, setTheme] = useState<"light" | "dark">(() => sanitizeTheme(ui0?.theme))
  const leftPanelScrollRef = useRef<HTMLElement>(null)
  const prevActiveModeRef = useRef<AppMode>(sanitizeAppMode(ui0?.activeMode ?? mockState.activeMode))
  const leftPanelScrollCancelRef = useRef<(() => void) | null>(null)

  const imitation = useImitation()
  const policyGradient = usePolicyGradient(headlessPolicyGradient)
  const evolution = useEvolution(headlessEvolution)
  const [imitState] = imitation
  const [pgState] = policyGradient
  const [evState] = evolution

  const isHeadlessForUi =
    activeMode === "policy-gradient"
      ? headlessPolicyGradient
      : activeMode === "evolution"
        ? headlessEvolution
        : false

  const modeLocked =
    !!imitState.isTraining ||
    !!imitState.isEvaluating ||
    !!pgState.isTraining ||
    !!pgState.isEvaluating ||
    !!evState.isTraining ||
    !!evState.isEvaluating

  const headlessToggleDisabled =
    activeMode === "policy-gradient"
      ? !!pgState.isEvaluating
      : activeMode === "evolution"
        ? !!evState.isEvaluating
        : false

  const narrowViewportOpen = useNarrowViewportBlocked()

  const navFileActionsDisabled =
    (activeMode === "imitation" && (!!imitState.isTraining || !!imitState.isEvaluating)) ||
    (activeMode === "policy-gradient" && (!!pgState.isTraining || !!pgState.isEvaluating)) ||
    (activeMode === "evolution" && (!!evState.isTraining || !!evState.isEvaluating))

  const handleHeadlessToggle = useCallback(() => {
    if (activeMode === "policy-gradient") {
      const [, pgActions] = policyGradient
      if (pgState.isTraining) {
        if (headlessPolicyGradient) {
          pgActions?.switchHeadlessAndRestart?.()
          setHeadlessPolicyGradient(false)
        } else {
          pgActions?.setEvaluating?.(false)
          pgActions?.switchHeadlessAndRestart?.(() => setHeadlessPolicyGradient(true))
        }
      } else {
        if (!headlessPolicyGradient) pgActions?.setEvaluating?.(false)
        setHeadlessPolicyGradient((h) => !h)
      }
    } else if (activeMode === "evolution") {
      setHeadlessEvolution((h) => !h)
    }
  }, [activeMode, policyGradient, pgState.isTraining, headlessPolicyGradient])

  useLayoutEffect(() => {
    const root = document.documentElement
    if (theme === "dark") root.classList.add("dark")
    else root.classList.remove("dark")
  }, [theme])

  useLayoutEffect(() => {
    if (prevActiveModeRef.current === activeMode) return
    prevActiveModeRef.current = activeMode
    if (!leftPanelOpen) return
    const el = leftPanelScrollRef.current
    if (!el) return

    leftPanelScrollCancelRef.current?.()
    leftPanelScrollCancelRef.current = animateLeftPanelScrollToBottom(el, 1400)

    return () => {
      leftPanelScrollCancelRef.current?.()
      leftPanelScrollCancelRef.current = null
    }
  }, [activeMode, leftPanelOpen])

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0f1115" : "#f8fafc")
  }, [theme])

  useEffect(() => {
    schedulePersist({
      ui: {
        activeMode,
        headlessPolicyGradient,
        headlessEvolution,
        leftPanelOpen,
        theme,
      },
    })
  }, [activeMode, headlessPolicyGradient, headlessEvolution, leftPanelOpen, theme])

  useEffect(() => {
    if (activeMode === "evolution" && headlessEvolution) {
      if (evState.isTraining) return
      if (evState.runComplete || evState.isEvaluating) {
        queueMicrotask(() => setHeadlessEvolution(false))
      }
      return
    }
    if (activeMode === "policy-gradient" && headlessPolicyGradient) {
      if (pgState.isTraining) return
      if (pgState.isEvaluating) {
        queueMicrotask(() => setHeadlessPolicyGradient(false))
        return
      }
      const runDone =
        !!pgState.model &&
        (pgState.totalUpdates ?? 0) > 0 &&
        (pgState.updateCount ?? 0) >= (pgState.totalUpdates ?? 0)
      if (runDone) queueMicrotask(() => setHeadlessPolicyGradient(false))
    }
  }, [
    activeMode,
    headlessEvolution,
    headlessPolicyGradient,
    evState.isTraining,
    evState.runComplete,
    evState.isEvaluating,
    pgState.isTraining,
    pgState.isEvaluating,
    pgState.model,
    pgState.updateCount,
    pgState.totalUpdates,
  ])

  useEffect(() => {
    const flush = () => flushPersist()
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("beforeunload", flush)
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("beforeunload", flush)
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "synapse-runner-v1" || !e.newValue) return
      try {
        const o = JSON.parse(e.newValue) as { ui?: { theme?: unknown } }
        setTheme(sanitizeTheme(o.ui?.theme))
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  return (
    <>
      <div
        className="app-viewport flex min-h-0 flex-col overflow-hidden bg-background text-foreground"
        inert={narrowViewportOpen ? true : undefined}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-[200] focus:rounded-md focus:border focus:border-border focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <TopNav
          activeMode={activeMode}
          theme={theme}
          onThemeChange={setTheme}
          fileActionsDisabled={navFileActionsDisabled}
          leftPanelOpen={leftPanelOpen}
          onLeftPanelToggle={() => setLeftPanelOpen(!leftPanelOpen)}
          imitation={imitation}
          policyGradient={policyGradient}
          evolution={evolution}
        />

        <div className="flex flex-1 overflow-hidden">
          <aside
            ref={leftPanelScrollRef}
            className={`shrink-0 overflow-y-auto border-r border-border transition-[width] duration-200 ease-in-out ${
              leftPanelOpen ? "w-[min(420px,40vw)]" : "w-0"
            }`}
          >
            <div className="w-full min-w-0 max-w-[420px] p-4">
              <ControlPanel
                activeMode={activeMode}
                onModeChange={(mode) => setActiveMode(sanitizeAppMode(mode))}
                modeLocked={modeLocked}
                imitation={imitation}
                policyGradient={policyGradient}
                evolution={evolution}
                isHeadless={isHeadlessForUi}
                onHeadlessToggle={handleHeadlessToggle}
                headlessToggleDisabled={headlessToggleDisabled}
                onPolicyGradientEvaluate={() => {
                  if (headlessPolicyGradient) setHeadlessPolicyGradient(false)
                }}
              />
            </div>
          </aside>

          <main
            id="main-content"
            className="flex flex-1 flex-col min-h-0 min-w-0 overflow-y-auto p-4"
            tabIndex={-1}
          >
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
      <ToastViewport />
      <NarrowViewportGate open={narrowViewportOpen} />
    </>
  )
}

export default App
