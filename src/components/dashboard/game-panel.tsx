import { useRef, useState, useEffect } from "react"
import { Monitor } from "lucide-react"
import { cn } from "@/lib/utils"
import { mockState } from "@/lib/mock-data"
import { useHumanRunner } from "@/hooks/useHumanRunner"
import { GAME_CONFIG } from "@/game/config"
import { getObservation } from "@/game/engine"
import { ObservationInspector } from "./observation-inspector"
import { MetricTile } from "./metric-tile"

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

function MetadataCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-card border border-border p-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-xs font-mono font-medium text-card-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}

export function GamePanel({ activeMode, isHeadless, onHumanMetricsChange }: GamePanelProps) {
  const { metrics, run } = mockState
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
    if (activeMode !== "human" || isHeadless) return
    const el = sceneRef.current
    if (!el) return
    const update = () => setSceneWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeMode, isHeadless])

  const runner = useHumanRunner({
    paused: isHeadless || activeMode !== "human",
    viewWidth: activeMode === "human" ? sceneWidth : 800,
    started: activeMode === "human" ? gameStarted : true,
  })

  const isHuman = activeMode === "human"

  useEffect(() => {
    if (!isHuman || !runner.gameOver || runCount === 0) return
    if (lastRecordedRunRef.current === runCount) return
    lastRecordedRunRef.current = runCount
    setScoreHistory((prev) => [...prev, { name: String(runCount), value: runner.score }])
  }, [isHuman, runner.gameOver, runner.score, runCount])

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
        className="relative min-h-[200px] flex-1 rounded-xl border border-border bg-card overflow-hidden"
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
              ref={isHuman ? sceneRef : undefined}
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
                  ...(isHuman && runner.state ? { transform: `translateY(-${runner.state.playerY}px)` } : {}),
                }}
                aria-hidden="true"
              >
                {isHuman && runner.state && debugHitboxes && (
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
                  const grounded = isHuman && runner.state && !runner.gameOver && runner.state.playerY <= 0
                  const inAir = isHuman && runner.state && !runner.gameOver && runner.state.playerY > 0
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

              {isHuman && runner.state ? (
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

              {isHuman && runner.state && debugHitboxes && (
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

              <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Score
                </span>
                <span className="text-2xl font-mono font-bold text-foreground/80 tabular-nums">
                  {String(isHuman ? runner.score : metrics.score).padStart(5, "0")}
                </span>
              </div>

              <div className="absolute top-4 left-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Distance
                  </span>
                  <span
                    className={cn(
                      "text-xs font-mono tabular-nums",
                      isHuman ? "text-foreground/80" : "text-muted-foreground/50"
                    )}
                  >
                    {isHuman
                      ? `${Math.round(Number(runner.pixelsTraveled ?? 0)).toLocaleString()} px`
                      : run.distance}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    FPS
                  </span>
                  <span
                    className={cn(
                      "text-xs font-mono tabular-nums",
                      isHuman ? "text-foreground/80" : "text-muted-foreground/50"
                    )}
                  >
                    {isHuman ? measuredFps : run.fps}
                  </span>
                </div>
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

      {!isHuman && (
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

      {!isHuman && (
        <div className="grid shrink-0 grid-cols-4 gap-3">
          <MetadataCell label="Run ID" value={run.id} />
          <MetadataCell label="Duration" value={run.duration} />
          <MetadataCell label="FPS" value={run.fps} />
          <MetadataCell label="Params" value={run.params} />
        </div>
      )}

      <div className={cn("shrink-0", isHuman ? "grid grid-cols-[auto_1fr] gap-4" : "")}>
        {isHuman && (
          <div className="grid grid-cols-2 gap-3 content-start w-[280px]">
            <MetricTile label="Score" value={runner.score} highlight />
            <MetricTile label="Best" value={runner.bestScore} />
            <MetricTile label="Runs" value={runCount} />
            <MetricTile label="Speed" value={runner.speed.toFixed(3)} unit="x" />
            <MetricTile label="Action" value={runner.state && (runner.state.playerY > 0 || runner.state.playerVy > 0) ? "JUMP" : "RUN"} />
            <MetricTile label="Duration" value={formatDuration(runDurationSeconds)} />
          </div>
        )}
        <ObservationInspector
          observations={
            isHuman && runner.state
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
    </div>
  )
}
