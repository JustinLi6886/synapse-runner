import { useRef, useState, useEffect, useMemo, useCallback } from "react"
import { Monitor } from "lucide-react"
import { cn } from "@/lib/utils"
import { mockState } from "@/lib/mock-data"
import { useGameRunner } from "@/hooks/useGameRunner"
import { HumanController, ModelController, SamplingModelController } from "@/ai/controller"
import { GAME_CONFIG } from "@/game/config"
import { getObservation } from "@/game/engine"
import { ObservationInspector } from "./observation-inspector"
import { ChartContainer } from "./chart-container"
import { InfoTooltip } from "./info-tooltip"
import type { ImitationState, ImitationActions } from "@/hooks/useImitation"
import type { PolicyGradientState, PolicyGradientActions } from "@/hooks/usePolicyGradient"
import type { Action } from "@/game/types"

export interface HumanLiveMetrics {
  score: number
  bestScore: number
  episode: number
  speed: string | number
  jumpProb: string
  action: string
  duration: string
  seed: number | null
  scoreHistory: { name: string; value: number }[]
}

interface GamePanelProps {
  activeMode: string
  isHeadless: boolean
  onHumanMetricsChange?: (metrics: HumanLiveMetrics) => void
  imitation?: [ImitationState, ImitationActions]
  policyGradient?: [PolicyGradientState, PolicyGradientActions]
}

const modeLabels: Record<string, string> = {
  human: "Human",
  imitation: "Imitation Learning",
  "policy-gradient": "Policy Gradient",
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

export function GamePanel({ activeMode, isHeadless, onHumanMetricsChange, imitation, policyGradient }: GamePanelProps) {
  const { metrics } = mockState
  const progressPct = Math.round((metrics.episode / metrics.totalEpisodes) * 100)

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

  const humanCtrl = useMemo(() => new HumanController(), [])
  const modelCtrlRef = useRef<ModelController | null>(null)
  const samplingCtrlRef = useRef<SamplingModelController | null>(null)

  const predictRef = useRef<((obs: number[]) => number) | null>(null)
  useEffect(() => {
    const model = activeMode === "imitation" ? imitState?.model : activeMode === "policy-gradient" ? pgState?.model : null
    const threshold = activeMode === "imitation" ? imitState?.threshold : activeMode === "policy-gradient" ? pgState?.threshold : 0.5
    if (model) {
      predictRef.current = (obs: number[]) => model.predict(obs)[0]
      modelCtrlRef.current = new ModelController(predictRef.current, threshold)
      samplingCtrlRef.current = new SamplingModelController(predictRef.current)
    } else {
      modelCtrlRef.current = null
      samplingCtrlRef.current = null
    }
  }, [activeMode, imitState?.model, imitState?.threshold, pgState?.model, pgState?.threshold])

  const isHuman = activeMode === "human"
  const isImitationEval = activeMode === "imitation" && !!imitState?.isEvaluating && !!imitState?.model
  const isPolicyGradientEval = activeMode === "policy-gradient" && !!pgState?.isEvaluating && !!pgState?.model
  const isPolicyGradientTraining = activeMode === "policy-gradient" && !!pgState?.isTraining && !isHeadless && !!pgState?.model
  const controller =
    isPolicyGradientTraining && samplingCtrlRef.current
      ? samplingCtrlRef.current
      : (isImitationEval || isPolicyGradientEval) && modelCtrlRef.current
        ? modelCtrlRef.current
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
    if (activeMode !== "human" && !isImitationEval && !isPolicyGradientEval && !isPolicyGradientTraining) {
      setGameStarted(false)
    }
  }, [activeMode, isImitationEval, isPolicyGradientEval, isPolicyGradientTraining])

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
    if ((!isHuman && activeMode !== "imitation" && activeMode !== "policy-gradient") || (isHeadless && !isPolicyGradientTraining)) return
    const el = sceneRef.current
    if (!el) return
    const update = () => setSceneWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isHuman, activeMode, isImitationEval, isPolicyGradientEval, isPolicyGradientTraining, isHeadless])

  const trajectoryRef = useRef<{ obs: number[]; action: number; logProb: number; reward: number }[]>([])
  const onStepComplete = useCallback(
    (obs: number[], action: number, logProb: number, reward: number) => {
      if (!isPolicyGradientTraining) return
      trajectoryRef.current.push({ obs, action, logProb, reward })
    },
    [isPolicyGradientTraining]
  )

  const showGame = activeMode === "human" || isImitationEval || isPolicyGradientEval || isPolicyGradientTraining
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
    if (!isImitationEval && !isPolicyGradientEval && !isPolicyGradientTraining) return
    if (isPolicyGradientTraining && runner.gameOver && pgActions?.reportEpisodeComplete) {
      const trajectory = trajectoryRef.current.map((t) => ({
        obs: t.obs,
        action: t.action as 0 | 1,
        logProb: t.logProb,
        reward: t.reward,
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
    if (!isImitationEval && !isPolicyGradientEval) return
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
  }, [isImitationEval, isPolicyGradientEval, isPolicyGradientTraining, gameStarted, runner.gameOver, runner.score, runner.reset, imitActions, pgActions, runCount])

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

  useEffect(() => {
    if (!isHuman || !onHumanMetricsChange) return
    const state = runner.state
    const inAir = state && (state.playerY > 0 || state.playerVy > 0)
    onHumanMetricsChange({
      score: runner.score,
      bestScore: runner.bestScore,
      episode: runCount,
      speed: runner.speed.toFixed(3),
      jumpProb: "—",
      action: inAir ? "JUMP" : "RUN",
      duration: formatDuration(runDurationSeconds),
      seed: state?.seed ?? null,
      scoreHistory,
    })
  }, [
    isHuman,
    onHumanMetricsChange,
    runner.score,
    runner.bestScore,
    runner.speed,
    runCount,
    runner.state?.playerY,
    runner.state?.playerVy,
    runDurationSeconds,
    scoreHistory,
  ])

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
                  : "Stopped"
              : activeMode === "imitation" && imitState?.isEvaluating
                ? "Evaluating"
                : activeMode === "policy-gradient" && pgState?.isEvaluating
                  ? "Evaluating"
                  : imitState?.isTraining
                    ? "Training"
                    : pgState?.isTraining
                      ? "Training"
                      : activeMode === "imitation"
                        ? "Ready"
                        : activeMode === "policy-gradient"
                          ? "Ready"
                          : "Training"
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
        {isHeadless ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-card/80 backdrop-blur-sm">
            <Monitor className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                Training in headless mode
              </span>
              <span className="text-xs text-muted-foreground/60">
                Canvas rendering disabled for performance
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
              ref={isHuman || activeMode === "imitation" || activeMode === "policy-gradient" ? sceneRef : undefined}
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
                  const isActive = showGame || activeMode === "imitation" || activeMode === "policy-gradient"
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

              {(isImitationEval || isPolicyGradientEval) && (
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
                    {runner.state && ((isImitationEval && imitState?.model) || (isPolicyGradientEval && pgState?.model))
                      ? (imitState?.model ?? pgState?.model)!.predict(getObservation(runner.state))[0].toFixed(3)
                      : "0.000"}
                  </span>
                </div>
              )}

              {(showGame || activeMode === "imitation" || activeMode === "policy-gradient") && runner.state ? (
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
                {(isHuman || activeMode === "imitation" || activeMode === "policy-gradient") && (
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
                      ? "Model ready — click Evaluate in the panel to watch it play"
                      : imitState && imitState.datasetSize > 0
                        ? "Dataset recorded — click Train Model in the panel"
                        : "Play in Human mode with Record on to collect training data"}
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
              <InfoTooltip description="Policy updates completed. Each update uses Episodes/Update episodes." />
            </span>
            <span className="text-[11px] font-mono font-medium text-muted-foreground tabular-nums">
              {(pgState?.returnHistory?.length ?? 0)} / {(pgState?.totalUpdates ?? 0) > 0 ? (pgState?.totalUpdates ?? 0) : (pgState?.targetUpdates ?? 500)}
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={pgState?.returnHistory?.length ?? 0}
            aria-valuemin={0}
            aria-valuemax={(pgState?.totalUpdates ?? 0) > 0 ? (pgState?.totalUpdates ?? 0) : (pgState?.targetUpdates ?? 500)}
            aria-label="Updates progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{
                width: `${Math.min(100, ((pgState?.returnHistory?.length ?? 0) / ((pgState?.totalUpdates ?? 0) > 0 ? (pgState?.totalUpdates ?? 0) : (pgState?.targetUpdates ?? 500) || 1)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
      {activeMode === "evolution" && (
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Episode Progress</span>
            <span className="text-[11px] font-mono font-medium text-muted-foreground tabular-nums">
              {metrics.episode} / {metrics.totalEpisodes}
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={metrics.episode}
            aria-valuemin={0}
            aria-valuemax={metrics.totalEpisodes}
            aria-label="Episode progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      <div className={cn(
        "shrink-0",
        (isHuman || activeMode === "imitation" || activeMode === "policy-gradient") && "grid grid-cols-[2fr_3fr] gap-4"
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
        <ObservationInspector
          observations={
            (showGame || activeMode === "imitation") && runner.state
              ? (() => {
                  const s = runner.state!
                  const obs = getObservation(s)
                  const nextObs = s.obstacles
                    .filter((o) => o.x + o.width > GAME_CONFIG.playerX)
                    .sort((a, b) => a.x - b.x)[0] ?? null
                  const rawDist = nextObs ? Math.max(0, nextObs.x - GAME_CONFIG.playerX) : 0
                  return [
                    { label: "Distance to Obstacle", value: obs[0], max: 1, displayValue: String(Math.floor(rawDist)) },
                    { label: "Obstacle Width", value: obs[1], max: 1, displayValue: String(Math.round(nextObs?.width ?? 0)) },
                    { label: "Obstacle Height", value: obs[2], max: 1, displayValue: String(Math.round(nextObs?.height ?? 0)) },
                    { label: "Player Y", value: obs[3], max: 1, displayValue: s.playerY.toFixed(1) },
                    { label: "Player Velocity", value: obs[4], max: 1, displayValue: s.playerVy.toFixed(2) },
                    { label: "Game Speed", value: obs[5], max: 1, displayValue: s.gameSpeed.toFixed(2) },
                  ]
                })()
              : undefined
          }
        />
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
