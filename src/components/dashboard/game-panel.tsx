import { useRef, useState, useEffect, useMemo, useCallback } from "react"
import { Monitor } from "lucide-react"
import { cn } from "@/lib/utils"
import { useGameRunner } from "@/hooks/useGameRunner"
import { HumanController, ModelController, SamplingModelController } from "@/ai/controller"
import { GAME_CONFIG } from "@/game/config"
import { createGameState, step, getObservation } from "@/game/engine"
import { ObservationInspector } from "./observation-inspector"
import { ChartContainer } from "./chart-container"
import { InfoTooltip } from "./info-tooltip"
import type { ImitationState, ImitationActions } from "@/hooks/useImitation"
import type { PolicyGradientState, PolicyGradientActions } from "@/hooks/usePolicyGradient"
import type { EvolutionState, EvolutionActions } from "@/hooks/useEvolution"
import type { Action } from "@/game/types"

interface GamePanelProps {
  activeMode: string
  isHeadless: boolean
  imitation?: [ImitationState, ImitationActions]
  policyGradient?: [PolicyGradientState, PolicyGradientActions]
  evolution?: [EvolutionState, EvolutionActions]
}

const modeLabels: Record<string, string> = {
  human: "Human",
  imitation: "Imitation Learning",
  "policy-gradient": "Policy Gradient (RL)",
  evolution: "Evolution Strategy",
}

function StatusBadge({ label, color, pulse = false }: { label: string; color: "primary" | "accent" | "destructive"; pulse?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold",
        color === "primary" && "bg-primary/10 text-primary",
        color === "accent" && "bg-accent/10 text-accent",
        color === "destructive" && "bg-destructive/10 text-destructive"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          color === "primary" && "bg-primary",
          color === "accent" && "bg-accent",
          color === "destructive" && "bg-destructive",
          pulse && "animate-pulse"
        )}
      />
      {label}
    </span>
  )
}

const ARENA_COLORS = [
  '#facc15', '#3b82f6', '#06b6d4', '#22c55e', '#a78bfa',
  '#f97316', '#ec4899', '#14b8a6', '#f43f5e', '#8b5cf6',
  '#84cc16', '#fb923c',
]

function EvolutionArena({ agents, threshold, onAllDead, overlay }: {
  agents: { predictOnly(obs: number[]): number }[]
  threshold: number
  onAllDead: () => void
  overlay?: React.ReactNode
}) {
  const count = Math.min(12, agents.length)
  const statesRef = useRef<ReturnType<typeof createGameState>[]>([])
  const agentsRef = useRef(agents)
  const onAllDeadRef = useRef(onAllDead)
  const hasFiredRef = useRef(false)
  const [, setTick] = useState(0)

  useEffect(() => { onAllDeadRef.current = onAllDead }, [onAllDead])

  useEffect(() => {
    agentsRef.current = agents
    hasFiredRef.current = false
    const baseSeed = Date.now()
    statesRef.current = agents.slice(0, count).map((_, i) =>
      createGameState(800, baseSeed + i * 997)
    )
  }, [agents, count])

  useEffect(() => {
    if (count === 0) return
    let rafId: number
    const loop = () => {
      let allDead = true
      for (let i = 0; i < count; i++) {
        const st = statesRef.current[i]
        if (!st || st.gameOver) continue
        allDead = false
        const obs = getObservation(st)
        const grounded = st.playerY <= 0
        let action: Action = 0
        if (grounded && agentsRef.current[i]) {
          if (agentsRef.current[i].predictOnly(obs) >= threshold) action = 1
        }
        statesRef.current[i] = step(st, action, 1 / 60).state
      }
      if (allDead && !hasFiredRef.current && statesRef.current.length > 0) {
        hasFiredRef.current = true
        setTick(t => t + 1)
        onAllDeadRef.current()
        return
      }
      setTick(t => t + 1)
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [agents, count, threshold])

  const idle = count === 0

  return (
    <div className="relative w-full h-full">
      <div className="grid grid-cols-3 grid-rows-4 gap-0 w-full h-full">
        {Array.from({ length: 12 }, (_, i) => {
          const hasAgent = i < count
          const state = hasAgent ? statesRef.current[i] : undefined
          const color = ARENA_COLORS[i]
          const grounded = idle || (state && !state.gameOver && state.playerY <= 0)
          const inAir = !idle && state && !state.gameOver && state.playerY > 0

          return (
            <div key={i} className="relative bg-[#0A0C0F] overflow-hidden">
              <div className="absolute bottom-6 left-0 right-0 h-px bg-border" />
              <div className="absolute bottom-0 left-0 right-0 h-6 border-t border-border/50" />

              <div
                className="absolute"
                style={{
                  left: `${(GAME_CONFIG.playerX / 800) * 100}%`,
                  bottom: `calc(1.5rem + 4px)`,
                  transform: state ? `translateY(-${state.playerY * 0.5}px)` : undefined,
                }}
              >
                <div
                  className="h-5 w-[14px] rounded-sm"
                  style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}50` }}
                />
                <div
                  className={`absolute -bottom-[6px] left-px h-[7px] w-[4px] rounded-sm origin-top ${grounded ? "animate-walk-left" : ""} ${inAir ? "rotate-[20deg]" : ""}`}
                  style={{ backgroundColor: color, opacity: 0.5 }}
                />
                <div
                  className={`absolute -bottom-[6px] right-px h-[7px] w-[4px] rounded-sm origin-top ${grounded ? "animate-walk-right" : ""} ${inAir ? "rotate-[20deg]" : ""}`}
                  style={{ backgroundColor: color, opacity: 0.5 }}
                />
              </div>

              {state && state.obstacles.map((o) => (
                <div
                  key={o.id}
                  className="absolute bottom-6 rounded-sm bg-destructive/70"
                  style={{
                    left: `${(o.x / 800) * 100}%`,
                    width: `${Math.max((o.width / 800) * 100, 0.5)}%`,
                    height: `${Math.min(o.height * 0.5, 32)}px`,
                  }}
                />
              ))}

              <span
                className="absolute top-2.5 left-2 text-[9px] font-bold leading-none"
                style={{ color }}
              >
                #{i + 1}
              </span>
              <span className="absolute top-2.5 right-2 text-[9px] font-mono text-foreground tabular-nums leading-none">
                {Math.floor(state?.distance ?? 0).toLocaleString()}
              </span>

              {state?.gameOver && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-[8px] tracking-wider text-foreground/50" style={{ fontFamily: "'Press Start 2P', monospace" }}>
                    END
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {overlay}
    </div>
  )
}

export function GamePanel({ activeMode, isHeadless, imitation, policyGradient, evolution }: GamePanelProps) {

  const sceneRef = useRef<HTMLDivElement>(null)
  const [sceneWidth, setSceneWidth] = useState(800)
  const [debugHitboxes, setDebugHitboxes] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [runCount, setRunCount] = useState(0)
  const [runDurationSeconds, setRunDurationSeconds] = useState(0)
  const [measuredFps, setMeasuredFps] = useState(0)
  const [scoreHistory, setScoreHistory] = useState<{ name: string; value: number }[]>([])
  const runStartTimeRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)
  const lastRecordedRunRef = useRef(0)
  const lastEvalReportedRef = useRef(0)

  const [imitState, imitActions] = imitation ?? [undefined, undefined]
  const [pgState, pgActions] = policyGradient ?? [undefined, undefined]
  const [evState, evActions] = evolution ?? [undefined, undefined]

  const humanCtrl = useMemo(() => new HumanController(), [])

  const activeModel = activeMode === "imitation" ? imitState?.model
    : activeMode === "policy-gradient" ? pgState?.model
    : activeMode === "evolution" ? evState?.model
    : null
  const activeThreshold = activeMode === "imitation" ? imitState?.threshold
    : activeMode === "policy-gradient" ? pgState?.threshold
    : activeMode === "evolution" ? evState?.threshold
    : 0.5
  const isEvolution = activeMode === "evolution"
  const modelCtrl = useMemo(() => {
    if (!activeModel) return null
    const predict = (obs: number[]) => activeModel.predict(obs)[0]
    return new ModelController(predict, activeThreshold, !isEvolution)
  }, [activeModel, activeThreshold, isEvolution])
  const samplingCtrl = useMemo(() => {
    if (!activeModel) return null
    const predict = (obs: number[]) => activeModel.predict(obs)[0]
    return new SamplingModelController(predict)
  }, [activeModel])

  const isHuman = activeMode === "human"
  const isImitationEval = activeMode === "imitation" && !!imitState?.isEvaluating && !!imitState?.model
  const isPolicyGradientEval = activeMode === "policy-gradient" && !!pgState?.isEvaluating && !!pgState?.model
  const isPolicyGradientTraining = activeMode === "policy-gradient" && !!pgState?.isTraining && !isHeadless && !!pgState?.model
  const isPolicyGradientRunFinished =
    activeMode === "policy-gradient" &&
    !!pgState?.model &&
    !pgState?.isTraining &&
    !pgState?.isEvaluating &&
    (pgState?.totalUpdates ?? 0) > 0 &&
    (pgState?.updateCount ?? 0) >= (pgState?.totalUpdates ?? 0)
  const showPolicyGradientReadyOnCanvas = isPolicyGradientRunFinished && !isHeadless
  const isPolicyGradientHeadlessStoppedMidRun =
    activeMode === "policy-gradient" &&
    isHeadless &&
    !!pgState?.model &&
    !pgState?.isTraining &&
    !pgState?.isEvaluating &&
    (pgState?.totalUpdates ?? 0) > 0 &&
    (pgState?.updateCount ?? 0) < (pgState?.totalUpdates ?? 0)
  const isEvolutionEval = activeMode === "evolution" && !evState?.isTraining && !!evState?.isEvaluating && !!evState?.model
  const isEvolutionSinglePlayerReady =
    activeMode === "evolution" &&
    !!evState?.runComplete &&
    !evState?.isTraining &&
    !evState?.isEvaluating &&
    !!evState?.model
  const isEvolutionArena =
    activeMode === "evolution" && !isHeadless && !isEvolutionEval && !isEvolutionSinglePlayerReady
  const isEvolutionShowcase = isEvolutionArena && !!evState?.isTraining && !!evState?.showcaseActive && evState!.elites.length > 0
  const isEvolutionEvaluating = isEvolutionArena && !!evState?.isTraining && !evState?.showcaseActive
  const isEvolutionIdleWithModel =
    isEvolutionArena && !evState?.isTraining && !evState?.isEvaluating && !!evState?.model && !evState?.runComplete
  const isEvolutionIdleNoModel = isEvolutionArena && !evState?.isTraining && !evState?.isEvaluating && !evState?.model
  const controller =
    isPolicyGradientTraining && samplingCtrl
      ? samplingCtrl
      : (isImitationEval || isPolicyGradientEval || isEvolutionEval) && modelCtrl
        ? modelCtrl
        : humanCtrl

  useEffect(() => {
    if (activeMode !== "human") return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.code === "ArrowUp") && !e.repeat) {
        e.preventDefault()
        humanCtrl.setJumpPressed(true)
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [activeMode, humanCtrl])

  const onStep = useCallback((obs: number[], action: Action, state: { playerY: number; playerVy: number }) => {
    if (!imitState?.isRecording || !imitActions) return
    const grounded = state.playerY <= 0 && state.playerVy <= 0
    if (!grounded) return
    imitActions.recordSample(obs, action)
  }, [imitState?.isRecording, imitActions])

  useEffect(() => {
    if (activeMode !== "human" && !isImitationEval && !isPolicyGradientEval && !isPolicyGradientTraining && !isEvolutionEval) {
      setGameStarted(false)
    }
  }, [activeMode, isImitationEval, isPolicyGradientEval, isPolicyGradientTraining, isEvolutionEval])

  useEffect(() => {
    if (activeMode !== "human") return
    if (gameStarted) {
      runStartTimeRef.current = Date.now()
      setRunDurationSeconds(0)
      setMeasuredFps(0)
      frameCountRef.current = 0
    } else {
      runStartTimeRef.current = null
      setRunDurationSeconds(0)
      setMeasuredFps(0)
    }
  }, [activeMode, gameStarted])

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  useEffect(() => {
    if ((!isHuman && activeMode !== "imitation" && activeMode !== "policy-gradient" && activeMode !== "evolution") || (isHeadless && !isPolicyGradientTraining)) return
    const el = sceneRef.current
    if (!el) return
    const update = () => setSceneWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isHuman, activeMode, isImitationEval, isPolicyGradientEval, isPolicyGradientTraining, isHeadless])

  const trajectoryRef = useRef<{ obs: number[]; action: number; logProb: number; reward: number; grounded: boolean }[]>([])
  const onStepComplete = useCallback(
    (obs: number[], action: number, logProb: number, reward: number, grounded: boolean) => {
      if (!isPolicyGradientTraining) return
      trajectoryRef.current.push({ obs, action, logProb, reward, grounded })
    },
    [isPolicyGradientTraining]
  )

  const showGame = activeMode === "human" || isImitationEval || isPolicyGradientEval || isPolicyGradientTraining || isEvolutionEval
  const agentSimSpeed = isPolicyGradientTraining ? (pgState?.simSpeed ?? 1) : 1
  const runner = useGameRunner({
    controller,
    paused: isHeadless || !showGame,
    viewWidth: showGame ? sceneWidth : 800,
    started: showGame ? gameStarted : false,
    simSpeed: agentSimSpeed,
    onStep: activeMode === "human" && imitState?.isRecording ? onStep : undefined,
    onStepComplete: isPolicyGradientTraining ? onStepComplete : undefined,
  })

  useEffect(() => {
    if (activeMode === "imitation" && !isImitationEval && !isPolicyGradientTraining) {
      runner.reset()
    }
    if (activeMode === "policy-gradient" && !isPolicyGradientEval && !isPolicyGradientTraining) {
      runner.reset()
    }
  }, [activeMode, isImitationEval, isPolicyGradientEval, isPolicyGradientTraining, runner.reset])

  useEffect(() => {
    if (!isHuman || !runner.gameOver || runCount === 0) return
    if (lastRecordedRunRef.current === runCount) return
    lastRecordedRunRef.current = runCount
    setScoreHistory((prev) => [...prev, { name: String(runCount), value: runner.score }])
  }, [isHuman, runner.gameOver, runner.score, runCount])

  useEffect(() => {
    if (isPolicyGradientTraining && !gameStarted) {
      trajectoryRef.current = []
      runner.reset(Date.now())
      setGameStarted(true)
      setRunCount((c) => c + 1)
    }
  }, [isPolicyGradientTraining, gameStarted, runner.reset])

  useEffect(() => {
    if (!isImitationEval && !isPolicyGradientEval && !isPolicyGradientTraining && !isEvolutionEval) return
    if (isPolicyGradientTraining && runner.gameOver && pgActions?.reportEpisodeComplete) {
      const trajectory = trajectoryRef.current.map((t) => ({
        obs: t.obs,
        action: t.action as 0 | 1,
        logProb: t.logProb,
        reward: t.reward,
        grounded: t.grounded,
      }))
      const nextSeed = pgActions.reportEpisodeComplete(trajectory, runner.score)
      trajectoryRef.current = []
      if (nextSeed !== null) {
        const id = setTimeout(() => {
          runner.reset(nextSeed)
          setGameStarted(true)
          setRunCount((c) => c + 1)
        }, 0)
        return () => clearTimeout(id)
      }
      return
    }
    if (!isImitationEval && !isPolicyGradientEval && !isEvolutionEval) return
    if (!gameStarted) {
      setGameStarted(true)
      setRunCount((c) => c + 1)
    } else if (runner.gameOver) {
      if (lastEvalReportedRef.current !== runCount) {
        lastEvalReportedRef.current = runCount
        if (isImitationEval) imitActions?.reportEvalScore?.(runner.score)
        if (isPolicyGradientEval) pgActions?.reportEvalScore?.(runner.score)
      }
      const id = setTimeout(() => {
        runner.reset()
        setGameStarted(true)
        setRunCount((c) => c + 1)
      }, 0)
      return () => clearTimeout(id)
    }
  }, [isImitationEval, isPolicyGradientEval, isPolicyGradientTraining, isEvolutionEval, gameStarted, runner.gameOver, runner.score, runner.reset, imitActions, pgActions, runCount])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyD") setDebugHitboxes((prev) => !prev)
      if ((e.code === "Space" || e.code === "ArrowUp") && activeMode === "human" && !e.repeat) {
        e.preventDefault()
        if (!gameStarted) {
          setGameStarted(true)
          setRunCount((c) => c + 1)
        } else if (runner.gameOver) {
          runner.reset()
          setGameStarted(true)
          setRunCount((c) => c + 1)
          runStartTimeRef.current = Date.now()
          setRunDurationSeconds(0)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [activeMode, gameStarted, runner.gameOver, runner.reset])

  useEffect(() => {
    if (!isHuman || !gameStarted || runner.gameOver) return
    const id = setInterval(() => {
      if (runStartTimeRef.current == null) return
      setRunDurationSeconds(Math.floor((Date.now() - runStartTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [isHuman, gameStarted, runner.gameOver])

  useEffect(() => {
    if (!isHuman || !gameStarted || runner.gameOver) return
    let rafId: number
    const loop = () => {
      frameCountRef.current += 1
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    const intervalId = setInterval(() => {
      setMeasuredFps(frameCountRef.current)
      frameCountRef.current = 0
    }, 1000)
    return () => {
      clearInterval(intervalId)
      cancelAnimationFrame(rafId)
    }
  }, [isHuman, gameStarted, runner.gameOver])

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-4">
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge label={modeLabels[activeMode] ?? "Human"} color="primary" />
        <StatusBadge
          label={
            activeMode === "human"
              ? runner.gameOver
                ? "Game Over"
                : gameStarted
                  ? "Playing"
                  : "Ready"
              : (activeMode === "imitation" && imitState?.isEvaluating)
                  || (activeMode === "policy-gradient" && pgState?.isEvaluating)
                  || (activeMode === "evolution" && evState?.isEvaluating)
                ? "Evaluating"
                : imitState?.isTraining || pgState?.isTraining || evState?.isTraining
                  ? "Training"
                  : "Ready"
          }
          color={
            activeMode === "human"
              ? gameStarted && !runner.gameOver
                ? "accent"
                : "destructive"
              : "accent"
          }
          pulse
        />
      </div>

      <div
        className="relative flex-1 min-h-[200px] rounded-xl border border-border bg-card overflow-hidden"
        role="img"
        aria-label="Game simulation canvas"
      >
        {isEvolutionArena ? (
          <EvolutionArena
            agents={isEvolutionShowcase ? evState!.elites : []}
            threshold={evState?.threshold ?? 0.5}
            onAllDead={evActions?.reportArenaComplete ?? (() => {})}
            overlay={
              isEvolutionEvaluating ? (
                <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center gap-2 pointer-events-none">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:150ms]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
                  </div>
                  <span className="text-sm font-medium text-foreground/70">
                    Evaluating generation {(evState?.generation ?? 0) + 1}...
                  </span>
                </div>
              ) : isEvolutionIdleWithModel ? (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
                    Training stopped — click Evolve to resume
                  </span>
                </div>
              ) : isEvolutionIdleNoModel ? (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
                    Click Evolve to start training a population
                  </span>
                </div>
              ) : undefined
            }
          />
        ) : isHeadless &&
          (activeMode === "evolution" ||
            pgState?.isTraining ||
            pgState?.isEvaluating ||
            (activeMode === "policy-gradient" && isPolicyGradientRunFinished) ||
            isPolicyGradientHeadlessStoppedMidRun) &&
          !(activeMode === "evolution" && evState?.runComplete && !evState?.isTraining) ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-card/80 backdrop-blur-sm">
            <Monitor className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                {activeMode === "policy-gradient" && isPolicyGradientRunFinished
                  ? "Headless on"
                  : activeMode === "policy-gradient" && isPolicyGradientHeadlessStoppedMidRun
                    ? "Training stopped"
                    : "Running headless"}
              </span>
              <span className="text-xs text-muted-foreground/60 text-center max-w-xs px-2">
                {activeMode === "policy-gradient" && isPolicyGradientRunFinished
                  ? "Turn off Headless to see the canvas and Evaluate"
                  : activeMode === "policy-gradient" && isPolicyGradientHeadlessStoppedMidRun
                    ? "Turn off Headless to view progress, or Continue Training"
                    : "Visual output paused for faster training"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2" aria-hidden="true">
              <div className="h-1 w-1 rounded-full bg-primary animate-pulse" />
              <div className="h-1 w-1 rounded-full bg-primary animate-pulse [animation-delay:150ms]" />
              <div className="h-1 w-1 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center">
            <div
              ref={isHuman || activeMode === "imitation" || activeMode === "policy-gradient" || activeMode === "evolution" ? sceneRef : undefined}
              className="relative w-full h-full bg-[#0A0C0F] flex items-end"
            >
              <div className="absolute bottom-12 left-0 right-0 h-px bg-border" />
              <div className="absolute bottom-0 left-0 right-0 h-12 border-t border-border/50">
                {Array.from({ length: 40 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute bottom-0 h-1.5 w-px bg-border/30"
                    style={{ left: `${i * 2.5}%` }}
                    aria-hidden="true"
                  />
                ))}
              </div>

              <div
                className="absolute"
                style={{
                  left: GAME_CONFIG.playerX,
                  bottom: "calc(3rem + 10px)",
                  ...(showGame && runner.state ? { transform: `translateY(-${runner.state.playerY}px)` } : {}),
                }}
                aria-hidden="true"
              >
                {showGame && runner.state && debugHitboxes && (
                  <div
                    className="absolute pointer-events-none rounded-sm border-2 border-yellow-400"
                    style={{
                      left: GAME_CONFIG.hitboxPadding,
                      bottom: GAME_CONFIG.playerHitboxBottomOffset + GAME_CONFIG.hitboxPadding,
                      width: GAME_CONFIG.playerW - 2 * GAME_CONFIG.hitboxPadding,
                      height: GAME_CONFIG.playerHitboxH - 2 * GAME_CONFIG.hitboxPadding,
                    }}
                    aria-hidden="true"
                  />
                )}
                <div className="h-8 w-6 rounded-sm bg-primary shadow-[0_0_12px_rgba(59,130,246,0.3)]" />
                {(() => {
                  const isActive = showGame || activeMode === "imitation" || activeMode === "policy-gradient" || activeMode === "evolution"
                  const grounded = isActive && runner.state && !runner.gameOver && (runner.state.playerY <= 0)
                  const inAir = isActive && runner.state && !runner.gameOver && runner.state.playerY > 0
                  return (
                    <>
                      <div
                        className={`absolute -bottom-[10px] left-0.5 h-3 w-1.5 rounded-sm bg-primary/60 origin-top ${grounded ? "animate-walk-left" : ""} ${inAir ? "rotate-[20deg]" : ""}`}
                      />
                      <div
                        className={`absolute -bottom-[10px] right-0.5 h-3 w-1.5 rounded-sm bg-primary/60 origin-top ${grounded ? "animate-walk-right" : ""} ${inAir ? "rotate-[20deg]" : ""}`}
                      />
                    </>
                  )
                })()}
              </div>

              {(isImitationEval || isPolicyGradientEval || isEvolutionEval) && (
                <div
                  className="absolute flex flex-col items-center gap-0.5 pointer-events-none"
                  style={{
                    left: GAME_CONFIG.playerX + GAME_CONFIG.playerW / 2,
                    bottom: "calc(3rem + 10px + 10rem)",
                    transform: "translateX(-50%)",
                  }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Jump Probability
                  </span>
                  <span className="text-2xl font-mono font-bold text-foreground/80 tabular-nums">
                    {runner.state && activeModel
                      ? activeModel.predict(getObservation(runner.state))[0].toFixed(3)
                      : "0.000"}
                  </span>
                </div>
              )}

              {(showGame || activeMode === "imitation" || activeMode === "policy-gradient" || activeMode === "evolution") && runner.state ? (
                runner.state.obstacles.map((o) => (
                  <div
                    key={o.id}
                    className="absolute bottom-12 rounded-sm bg-destructive/70"
                    style={{
                      left: `${o.x}px`,
                      width: o.width,
                      height: o.height,
                    }}
                    aria-hidden="true"
                  />
                ))
              ) : (
                <>
                  <div className="absolute bottom-12 left-[55%]" aria-hidden="true">
                    <div className="h-10 w-5 rounded-sm bg-destructive/70" />
                  </div>
                  <div className="absolute bottom-12 left-[78%]" aria-hidden="true">
                    <div className="h-14 w-4 rounded-sm bg-destructive/50" />
                  </div>
                  <div className="absolute bottom-12 left-[92%]" aria-hidden="true">
                    <div className="h-8 w-6 rounded-sm bg-destructive/40" />
                  </div>
                </>
              )}

              {showGame && runner.state && debugHitboxes && (
                <>
                  {runner.state.obstacles.map((o) => (
                    <div
                      key={o.id}
                      className="absolute pointer-events-none rounded-sm border-2 border-cyan-400"
                      style={{
                        left: o.x + GAME_CONFIG.hitboxPadding,
                        bottom: `calc(3rem + ${GAME_CONFIG.hitboxPadding}px)`,
                        width: o.width - 2 * GAME_CONFIG.hitboxPadding,
                        height: o.height - 2 * GAME_CONFIG.hitboxPadding,
                      }}
                      aria-hidden="true"
                    />
                  ))}
                </>
              )}

              <div className="absolute top-4 right-4 flex items-start gap-4">
                {(isHuman || activeMode === "imitation" || activeMode === "policy-gradient" || activeMode === "evolution") && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                      HI
                    </span>
                    <span className="text-2xl font-mono font-bold text-muted-foreground/50 tabular-nums">
                      {String(runner.bestScore).padStart(5, "0")}
                    </span>
                  </div>
                )}
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Score
                  </span>
                  <span className="text-2xl font-mono font-bold text-foreground/80 tabular-nums">
                    {String(runner.score).padStart(5, "0")}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Speed
                  </span>
                  <span className="text-2xl font-mono font-bold text-foreground/80 tabular-nums">
                    {runner.speed.toFixed(1)}x
                  </span>
                </div>
              </div>

              <div className="absolute top-4 left-4 flex flex-col gap-2">
                {isHuman && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                        FPS
                      </span>
                      <span className="text-xs font-mono tabular-nums text-foreground/80">
                        {measuredFps}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                        Distance
                      </span>
                      <span className="text-xs font-mono tabular-nums text-foreground/80">
                        {`${Math.round(Number(runner.pixelsTraveled ?? 0)).toLocaleString()} px`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                        Duration
                      </span>
                      <span className="text-xs font-mono tabular-nums text-foreground/80">
                        {formatDuration(runDurationSeconds)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {isHuman && runner.state && !gameStarted && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    Press{" "}
                    <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]">Space</kbd>
                    {" / "}
                    <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]">↑</kbd>
                    {" or click to start"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setGameStarted(true)
                      setRunCount((c) => c + 1)
                    }}
                    className={cn(
                      "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground",
                      "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  >
                    Start Game
                  </button>
                </div>
              )}

              {activeMode === "imitation" && !isImitationEval && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
                    {imitState?.model
                      ? "Model ready — click Evaluate to watch it play"
                      : imitState && imitState.datasetSize > 0
                        ? "Dataset recorded — click Train Model to begin"
                        : "Play in Human mode with Record on to collect training data"}
                  </span>
                </div>
              )}

              {isEvolutionSinglePlayerReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
                    Best model ready — click Evaluate to watch it play
                  </span>
                </div>
              )}

              {showPolicyGradientReadyOnCanvas && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
                    Policy ready — click Evaluate to watch it play
                  </span>
                </div>
              )}

              {isHuman && runner.gameOver && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="text-3xl tracking-wider" style={{ fontFamily: "'Press Start 2P', monospace" }}>
                    <span className="text-primary">GAME</span>{" "}
                    <span className="text-destructive">OVER</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      runner.reset()
                      setGameStarted(true)
                      setRunCount((c) => c + 1)
                      runStartTimeRef.current = Date.now()
                      setRunDurationSeconds(0)
                    }}
                    className={cn(
                      "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground",
                      "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  >
                    Reset
                  </button>
                  <span className="text-xs text-muted-foreground">
                    or press{" "}
                    <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]">Space</kbd>
                    {" / "}
                    <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]">↑</kbd>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {activeMode === "policy-gradient" && (
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              Updates Progress
              <InfoTooltip description="Updates done vs cumulative target — Continue adds the next batch to the total. Clear resets all." />
            </span>
            <span className="text-[11px] font-mono font-medium text-muted-foreground tabular-nums">
              {(pgState?.updateCount ?? 0)}/
              {(pgState?.totalUpdates ?? 0) > 0 ? (pgState?.totalUpdates ?? 0) : (pgState?.targetUpdates ?? 500)}
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={pgState?.updateCount ?? 0}
            aria-valuemin={0}
            aria-valuemax={(pgState?.totalUpdates ?? 0) > 0 ? (pgState?.totalUpdates ?? 0) : (pgState?.targetUpdates ?? 500)}
            aria-label="Updates progress"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.min(
                  100,
                  ((pgState?.updateCount ?? 0) /
                    (((pgState?.totalUpdates ?? 0) > 0 ? (pgState?.totalUpdates ?? 0) : (pgState?.targetUpdates ?? 500)) || 1)) *
                    100,
                )}%`,
              }}
            />
          </div>
        </div>
      )}
      {activeMode === "evolution" && evState && (
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              Generation Progress
              <InfoTooltip description="Current generation out of the target. Each generation evaluates the full population." />
            </span>
            <span className="text-[11px] font-mono font-medium text-muted-foreground tabular-nums">
              {evState.generation}/{evState.targetGenerations}
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={evState.generation}
            aria-valuemin={0}
            aria-valuemax={evState.targetGenerations}
            aria-label="Generation progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{
                width: `${Math.min(100, (evState.generation / Math.max(1, evState.targetGenerations)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className={cn(
        "shrink-0",
        (isHuman || activeMode === "imitation" || activeMode === "policy-gradient" || activeMode === "evolution") && "grid grid-cols-[2fr_3fr] gap-4"
      )}>
        {isHuman && (
          <div className="min-w-0">
            {scoreHistory.length > 0 ? (
              <ChartContainer data={scoreHistory} label="Score History" color="var(--primary)" />
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Score History
                </span>
                <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-border">
                  <span className="text-xs text-muted-foreground">No runs yet</span>
                </div>
              </div>
            )}
          </div>
        )}
        {activeMode === "imitation" && (
          <div className="min-w-0">
            {imitState?.lossHistory && imitState.lossHistory.length > 0 ? (
              <ChartContainer
                data={imitState.lossHistory}
                label="Training Loss"
                color="var(--primary)"
                tooltip="Measures how wrong the model's predictions are during training. Lower is better. The chart shows loss over each epoch."
              />
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  Training Loss
                  <InfoTooltip description="Measures how wrong the model's predictions are during training. Lower is better. The chart shows loss over each epoch." />
                </span>
                <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-border">
                  <span className="text-xs text-muted-foreground">
                    {imitState?.datasetSize === 0 ? "Record data first" : "Train to see loss"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        {activeMode === "policy-gradient" && (
          <div className="min-w-0">
            {pgState?.returnHistory && pgState.returnHistory.length > 0 ? (
              <ChartContainer
                data={pgState.returnHistory}
                label="Average Return"
                color="var(--accent)"
                tooltip="Average episode return per update. Higher is better."
              />
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  Average Return
                  <InfoTooltip description="Average episode return per update. Higher is better." />
                </span>
                <div className="h-[180px] flex items-center justify-center rounded-md border border-dashed border-border">
                  <span className="text-xs text-muted-foreground">Train to see returns</span>
                </div>
              </div>
            )}
          </div>
        )}
        {activeMode === "evolution" && (
          <div className="min-w-0">
            {evState?.fitnessHistory && evState.fitnessHistory.length > 0 ? (
              <ChartContainer
                data={evState.fitnessHistory}
                label="Best Fitness"
                color="var(--accent)"
                tooltip="Top fitness each generation, averaged across eval seeds."
              />
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  Best Fitness
                  <InfoTooltip description="Top fitness each generation, averaged across eval seeds." />
                </span>
                <div className="h-[180px] flex items-center justify-center rounded-md border border-dashed border-border">
                  <span className="text-xs text-muted-foreground">Evolve to see fitness</span>
                </div>
              </div>
            )}
          </div>
        )}
        {!isEvolutionArena &&
          (!isHeadless || isEvolutionSinglePlayerReady) &&
          !(activeMode === "policy-gradient" && isHeadless) && <ObservationInspector
          observations={
            (showGame || activeMode === "imitation") && runner.state
              ? (() => {
                  const s = runner.state!
                  const obs = getObservation(s)
                  let nextObs = null as typeof s.obstacles[0] | null
                  let bestDist = Infinity
                  for (const o of s.obstacles) {
                    if (o.x + o.width > GAME_CONFIG.playerX && o.x < bestDist) {
                      bestDist = o.x
                      nextObs = o
                    }
                  }
                  const rawDist = nextObs ? Math.max(0, nextObs.x - GAME_CONFIG.playerX) : 0
                  return [
                    { label: "Distance to Obstacle", value: obs[0], max: 1, displayValue: String(Math.floor(rawDist)) },
                    { label: "Obstacle Width", value: obs[1], max: 1, displayValue: String(Math.round(nextObs?.width ?? 0)) },
                    { label: "Obstacle Height", value: obs[2], max: 1, displayValue: String(Math.round(nextObs?.height ?? 0)) },
                    { label: "Player Y", value: obs[3], max: 1, displayValue: s.playerY.toFixed(1) },
                    { label: "Player Velocity", value: obs[4], max: 1, displayValue: s.playerVy.toFixed(2) },
                    { label: "Game Speed", value: obs[5], max: 1, displayValue: s.gameSpeed.toFixed(2) },
                    { label: "Height Clearance", value: obs[6], max: 1, displayValue: obs[6].toFixed(2) },
                  ]
                })()
              : undefined
          }
        />}
      </div>

      {activeMode === "imitation" && (
        <div className="grid grid-cols-6 gap-2 shrink-0">
          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              Final Loss
              <InfoTooltip description="The loss value at the end of training. Lower means the model learned the training data better." />
            </span>
            <span className="text-lg font-mono font-semibold tabular-nums text-primary">
              {imitState?.finalLoss != null ? imitState.finalLoss.toFixed(4) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              Precision
              <InfoTooltip description="Of the times the model predicted jump, how often was the human also jumping? High precision = fewer unnecessary jumps." />
            </span>
            <span className="text-lg font-mono font-semibold tabular-nums text-primary">
              {imitState?.metrics ? imitState.metrics.precision.toFixed(3) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              Recall
              <InfoTooltip description="Of the times the human jumped, how often did the model also predict jump? High recall = catches most of the jump moments." />
            </span>
            <span className="text-lg font-mono font-semibold tabular-nums text-primary">
              {imitState?.metrics ? imitState.metrics.recall.toFixed(3) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              F1
              <InfoTooltip description="Single score balancing precision and recall. F1 = 1 is perfect; lower means the model misses jumps, jumps too often, or both." />
            </span>
            <span className="text-lg font-mono font-semibold tabular-nums text-accent">
              {imitState?.metrics ? imitState.metrics.f1.toFixed(3) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground">Best Eval Score</span>
            <span className="text-lg font-mono font-semibold tabular-nums text-accent">
              {(imitState?.evalRunCount ?? 0) > 0 ? imitState?.bestEvalScore : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground">Eval Runs</span>
            <span className="text-lg font-mono font-semibold tabular-nums text-primary">
              {imitState?.evalRunCount ?? 0}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
