import { useRef, useState, useEffect, useMemo, useCallback } from "react"
import { Monitor } from "lucide-react"
import { cn } from "@/lib/utils"
import { useGameRunner } from "@/hooks/useGameRunner"
import { HumanController, ModelController, SamplingModelController } from "@/ai/controller"
import { rolloutTemperedJumpProb, spreadEvalProbTowardHalf } from "@/ai/actorCritic"
import { GAME_CONFIG, SIM_VIEW_WIDTH } from "@/game/config"
import { PG_DEFAULTS } from "@/lib/pg-defaults"
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
  imitation: "Imitation",
  "policy-gradient": "Policy gradient",
  evolution: "Evolution",
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

const NO_EVOLUTION_ARENA_AGENTS: { predictOnly(obs: number[]): number }[] = []

function RunnerCharacterFigure({ grounded, inAir }: { grounded: boolean; inAir: boolean }) {
  return (
    <>
      <div className="relative h-9 w-6 overflow-visible">
        <div className="absolute inset-0 rounded-sm bg-primary shadow-[0_0_12px_rgba(59,130,246,0.3)]" />
        <img
          src="/SR.png"
          alt=""
          className="pointer-events-none absolute left-1/2 top-0 z-[1] h-[29px] w-[31px] max-w-none -translate-x-1/2 -translate-y-[4px] object-contain object-top select-none"
          decoding="async"
        />
      </div>
      <div
        className={`absolute top-[20px] -left-[11px] z-[2] h-1.5 w-[12px] rounded-sm bg-primary/50 origin-right ${grounded ? "animate-arm-left" : inAir ? "rotate-[50deg]" : "rotate-[30deg]"}`}
      />
      <div
        className={`absolute top-[20px] -right-[11px] z-[2] h-1.5 w-[12px] rounded-sm bg-primary/50 origin-left ${grounded ? "animate-arm-right" : inAir ? "-rotate-[50deg]" : "-rotate-[30deg]"}`}
      />
      <div
        className={`absolute -bottom-[10px] left-0.5 h-3 w-1.5 rounded-sm bg-primary/60 origin-top ${grounded ? "animate-walk-left" : ""} ${inAir ? "rotate-[20deg]" : ""}`}
      />
      <div
        className={`absolute -bottom-[10px] right-0.5 h-3 w-1.5 rounded-sm bg-primary/60 origin-top ${grounded ? "animate-walk-right" : ""} ${inAir ? "rotate-[20deg]" : ""}`}
      />
    </>
  )
}

type EvolutionArenaGameState = ReturnType<typeof createGameState>

const ARENA_FIXED_DT = 1 / 60
const ARENA_MAX_ACCUM_SEC = 0.1

function EvolutionArena({ agents, threshold, onAllDead, overlay }: {
  agents: { predictOnly(obs: number[]): number }[]
  threshold: number
  onAllDead: () => void
  overlay?: React.ReactNode
}) {
  const count = Math.min(12, agents.length)
  const statesRef = useRef<EvolutionArenaGameState[]>([])
  const agentsRef = useRef(agents)
  const onAllDeadRef = useRef(onAllDead)
  const hasFiredRef = useRef(false)
  const [displayStates, setDisplayStates] = useState<EvolutionArenaGameState[]>([])

  useEffect(() => { onAllDeadRef.current = onAllDead }, [onAllDead])

  useEffect(() => {
    agentsRef.current = agents
    hasFiredRef.current = false
    const baseSeed = Date.now()
    const next = agents.slice(0, count).map((_, i) =>
      createGameState(SIM_VIEW_WIDTH, baseSeed + i * 997)
    )
    statesRef.current = next
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial snapshot only
    setDisplayStates(next)
  }, [agents, count])

  useEffect(() => {
    if (count === 0) return
    let rafId: number
    let lastTime: number | null = null
    let accum = 0
    const loop = (now: number) => {
      const dtMs = lastTime != null ? Math.min(now - lastTime, 50) : 0
      lastTime = now
      accum = Math.min(accum + dtMs / 1000, ARENA_MAX_ACCUM_SEC)

      while (accum >= ARENA_FIXED_DT) {
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
          statesRef.current[i] = step(st, action, ARENA_FIXED_DT).state
        }
        accum -= ARENA_FIXED_DT

        const snapshot = statesRef.current.slice(0, count)
        if (allDead && !hasFiredRef.current && statesRef.current.length > 0) {
          hasFiredRef.current = true
          setDisplayStates(snapshot)
          onAllDeadRef.current()
          return
        }
      }

      setDisplayStates(statesRef.current.slice(0, count))
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [agents, count, threshold])

  const idle = count === 0
  const showPreRunSlots = count === 0

  return (
    <div className="relative w-full h-full">
      <div className="grid grid-cols-3 grid-rows-4 gap-0 w-full h-full">
        {Array.from({ length: 12 }, (_, i) => {
          const hasAgent = i < count
          const state = hasAgent ? displayStates[i] : undefined
          const color = ARENA_COLORS[i]
          const grounded = !!(idle || (state && !state.gameOver && state.playerY <= 0))
          const inAir = !!(!idle && state && !state.gameOver && state.playerY > 0)
          const showCharacter = hasAgent || showPreRunSlots

          return (
            <div key={i} className="relative overflow-hidden bg-game-scene">
              <div className="absolute bottom-6 left-0 right-0 h-[0.5px] bg-game-line" />
              <div className="absolute bottom-0 left-0 right-0 h-6 border-t-[0.5px] border-game-line/55" />

              {showCharacter && (
                <div
                  className="absolute"
                  style={{
                    left: `${(GAME_CONFIG.playerX / SIM_VIEW_WIDTH) * 100}%`,
                    bottom: `calc(1.5rem + 4px)`,
                    transform:
                      hasAgent && state ? `translateY(-${state.playerY * 0.5}px)` : undefined,
                  }}
                >
                  <div className="origin-bottom scale-[0.4]">
                    <RunnerCharacterFigure grounded={grounded} inAir={inAir} />
                  </div>
                </div>
              )}

              {state &&
                state.obstacles.map((o) => (
                  <div
                    key={o.id}
                    className="absolute bottom-6 rounded-sm bg-destructive/70"
                    style={{
                      left: `${(o.x / SIM_VIEW_WIDTH) * 100}%`,
                      width: `${Math.max((o.width / SIM_VIEW_WIDTH) * 100, 0.5)}%`,
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
  const [sceneWidth, setSceneWidth] = useState(SIM_VIEW_WIDTH)
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
  const wasInAgentEvalRef = useRef(false)

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
  const modelCtrl = useMemo(() => {
    if (!activeModel) return null
    const predict = (obs: number[]) => activeModel.predictOnly(obs)
    const spread =
      activeMode === "policy-gradient" ? (pgState?.evalLogitTemperature ?? PG_DEFAULTS.evalLogitTemperature) : 1
    return new ModelController(predict, activeThreshold, spread)
  }, [activeModel, activeThreshold, activeMode, pgState?.evalLogitTemperature])
  const samplingCtrl = useMemo(() => {
    if (!activeModel) return null
    const T =
      activeMode === "policy-gradient" ? (pgState?.rolloutSamplingTemperature ?? PG_DEFAULTS.rolloutSamplingTemperature) : 1
    if (T >= 0.999 && T <= 1.001) {
      return new SamplingModelController((obs: number[]) => activeModel.predictOnly(obs))
    }
    return new SamplingModelController((obs: number[]) =>
      rolloutTemperedJumpProb(activeModel, obs, T),
    )
  }, [activeModel, activeMode, pgState?.rolloutSamplingTemperature])

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
  const showObservationInspector =
    !isEvolutionArena &&
    (!isHeadless || isEvolutionSinglePlayerReady) &&
    !(activeMode === "policy-gradient" && isHeadless)
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
      queueMicrotask(() => setGameStarted(false))
      wasInAgentEvalRef.current = false
    }
  }, [activeMode, isImitationEval, isPolicyGradientEval, isPolicyGradientTraining, isEvolutionEval])

  useEffect(() => {
    if (activeMode !== "human") return
    if (gameStarted) {
      runStartTimeRef.current = Date.now()
      frameCountRef.current = 0
      queueMicrotask(() => {
        setRunDurationSeconds(0)
        setMeasuredFps(0)
      })
    } else {
      runStartTimeRef.current = null
      queueMicrotask(() => {
        setRunDurationSeconds(0)
        setMeasuredFps(0)
      })
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

  const trajectoryRef = useRef<{ obs: number[]; action: number; reward: number; grounded: boolean }[]>([])
  const onStepComplete = useCallback(
    (obs: number[], action: number, _logProb: number, reward: number, grounded: boolean) => {
      if (!isPolicyGradientTraining) return
      trajectoryRef.current.push({ obs, action, reward, grounded })
    },
    [isPolicyGradientTraining]
  )
  const runnerViewWidth =
    activeMode === "policy-gradient" || activeMode === "evolution" ? SIM_VIEW_WIDTH : sceneWidth

  const showGame = activeMode === "human" || isImitationEval || isPolicyGradientEval || isPolicyGradientTraining || isEvolutionEval
  const agentSimSpeed = isPolicyGradientTraining ? (pgState?.simSpeed ?? 100) : 1
  const runner = useGameRunner({
    controller,
    paused: isHeadless || !showGame,
    viewWidth: showGame ? runnerViewWidth : SIM_VIEW_WIDTH,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runner object identity changes every frame
  }, [activeMode, isImitationEval, isPolicyGradientEval, isPolicyGradientTraining, runner.reset])

  useEffect(() => {
    if (!isHuman || !runner.gameOver || runCount === 0) return
    if (lastRecordedRunRef.current === runCount) return
    lastRecordedRunRef.current = runCount
    const recordedScore = runner.score
    queueMicrotask(() => {
      setScoreHistory((prev) => [...prev, { name: String(runCount), value: recordedScore }])
    })
  }, [isHuman, runner.gameOver, runner.score, runCount])

  useEffect(() => {
    if (isPolicyGradientTraining && !gameStarted) {
      trajectoryRef.current = []
      runner.reset(Date.now())
      queueMicrotask(() => {
        setGameStarted(true)
        setRunCount((c) => c + 1)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runner object identity changes every frame
  }, [isPolicyGradientTraining, gameStarted, runner.reset])

  useEffect(() => {
    if (!isImitationEval && !isPolicyGradientEval && !isPolicyGradientTraining && !isEvolutionEval) return
    if (isPolicyGradientTraining && runner.gameOver && pgActions?.reportEpisodeComplete) {
      const trajectory = trajectoryRef.current.map((t) => ({
        obs: t.obs,
        action: t.action as 0 | 1,
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

    const inAgentEval = isImitationEval || isPolicyGradientEval || isEvolutionEval
    if (inAgentEval && !wasInAgentEvalRef.current) {
      wasInAgentEvalRef.current = true
      queueMicrotask(() => {
        runner.reset(Date.now())
        setGameStarted(true)
        setRunCount((c) => c + 1)
      })
      return
    }

    if (!gameStarted) {
      queueMicrotask(() => {
        runner.reset(Date.now())
        setGameStarted(true)
        setRunCount((c) => c + 1)
      })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runner object identity changes every frame
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runner object identity changes every frame
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
      <div className="flex shrink-0 items-center gap-2" aria-live="polite" aria-atomic="true">
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
                ? "Testing"
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
        aria-label="Runner game view"
      >
        {isEvolutionArena ? (
          <EvolutionArena
            agents={isEvolutionShowcase ? evState!.elites : NO_EVOLUTION_ARENA_AGENTS}
            threshold={evState?.threshold ?? 0.5}
            onAllDead={evActions?.reportArenaComplete ?? (() => {})}
            overlay={
              isEvolutionEvaluating ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 z-[1]">
                  <div className="flex flex-col items-center gap-2 rounded-md border border-border/60 bg-card/90 px-4 py-3 shadow-sm backdrop-blur-sm max-w-sm text-center">
                    <div className="flex items-center gap-2" aria-hidden="true">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:150ms]" />
                      <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
                    </div>
                    <span className="text-sm font-medium text-foreground/80">
                      Evaluating generation {(evState?.generation ?? 0) + 1}…
                    </span>
                  </div>
                </div>
              ) : isEvolutionIdleWithModel ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 z-[1]">
                  <span className="text-[11px] text-muted-foreground rounded-md border border-border/60 bg-card/70 px-2.5 py-1.5 shadow-sm backdrop-blur-sm max-w-xs text-center">
                    Paused—press Evolve for another generation
                  </span>
                </div>
              ) : isEvolutionIdleNoModel ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 z-[1]">
                  <span className="text-[11px] text-muted-foreground rounded-md border border-border/60 bg-card/70 px-2.5 py-1.5 shadow-sm backdrop-blur-sm max-w-xs text-center">
                    Press Evolve to start training
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
                  ? "Still headless"
                  : activeMode === "policy-gradient" && isPolicyGradientHeadlessStoppedMidRun
                    ? "Paused mid-run"
                    : "Headless mode"}
              </span>
              <span className="text-xs text-muted-foreground/60 text-center max-w-xs px-2">
                {activeMode === "policy-gradient" && isPolicyGradientRunFinished
                  ? "Turn headless off to watch the run, or use Evaluate for a deterministic policy"
                  : activeMode === "policy-gradient" && isPolicyGradientHeadlessStoppedMidRun
                    ? "Turn headless off to view the canvas, or resume training"
                    : "Canvas hidden—training skips rendering for speed"}
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
              className="relative flex h-full w-full items-end bg-game-scene"
            >
              <div className="absolute bottom-12 left-0 right-0 h-[0.5px] bg-game-line" />
              <div className="absolute bottom-0 left-0 right-0 h-12 border-t-[0.5px] border-game-line/55" />

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
                <RunnerCharacterFigure
                  grounded={
                    (showGame || activeMode === "imitation" || activeMode === "policy-gradient" || activeMode === "evolution") &&
                    !!runner.state &&
                    !runner.gameOver &&
                    runner.state.playerY <= 0
                  }
                  inAir={
                    (showGame || activeMode === "imitation" || activeMode === "policy-gradient" || activeMode === "evolution") &&
                    !!runner.state &&
                    !runner.gameOver &&
                    runner.state.playerY > 0
                  }
                />
              </div>

              {(isImitationEval ||
                isPolicyGradientEval ||
                isPolicyGradientTraining ||
                isEvolutionEval) && (
                <div
                  className="absolute flex flex-col items-center gap-0.5 pointer-events-none max-w-[14rem] text-center"
                  style={{
                    left: GAME_CONFIG.playerX + GAME_CONFIG.playerW / 2,
                    bottom: "calc(3rem + 10px + 10rem)",
                    transform: "translateX(-50%)",
                  }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 flex items-center gap-1 justify-center">
                    {isPolicyGradientTraining
                      ? "P(jump) raw"
                      : isPolicyGradientEval
                        ? "Jump chance (eval)"
                        : "Jump chance"}
                    {isPolicyGradientTraining && (
                      <InfoTooltip description="P(jump) from the policy head before eval spread or rollout tempering (sigmoid of the last logit). Near 0.5 is roughly unbiased. Early in training, player height and speed often move first; gap and headroom change as the next obstacle gets closer." />
                    )}
                  </span>
                  <span className="text-2xl font-mono font-bold text-foreground/80 tabular-nums">
                    {runner.state && activeModel
                      ? (() => {
                          const raw = activeModel.predictOnly(getObservation(runner.state))
                          if (isPolicyGradientEval && pgState) {
                            const p = spreadEvalProbTowardHalf(raw, pgState.evalLogitTemperature ?? PG_DEFAULTS.evalLogitTemperature)
                            return Number.isFinite(p) ? p.toFixed(3) : "—"
                          }
                          return Number.isFinite(raw) ? raw.toFixed(3) : "—"
                        })()
                      : "0.000"}
                  </span>
                  {isPolicyGradientTraining && pgState && (pgState.rolloutSamplingTemperature ?? PG_DEFAULTS.rolloutSamplingTemperature) > 1.01 && (
                    <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                      sample T={Number((pgState.rolloutSamplingTemperature ?? PG_DEFAULTS.rolloutSamplingTemperature).toFixed(2))}:{" "}
                      {runner.state && activeModel
                        ? rolloutTemperedJumpProb(
                            activeModel,
                            getObservation(runner.state),
                            pgState.rolloutSamplingTemperature ?? PG_DEFAULTS.rolloutSamplingTemperature,
                          ).toFixed(3)
                        : "—"}
                    </span>
                  )}
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
                    {" or tap Start"}
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
                    Start
                  </button>
                </div>
              )}

              {activeMode === "imitation" && !isImitationEval && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
                    {imitState?.model
                      ? "Model ready—use Evaluate to watch it play."
                      : imitState && imitState.datasetSize > 0
                        ? "You have recorded data—press Train to fit the model."
                        : "Record demos in Human mode first (enable Record, then play a few runs)."}
                  </span>
                </div>
              )}

              {isEvolutionSinglePlayerReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
                    Run complete—use Evaluate to watch the best network.
                  </span>
                </div>
              )}

              {showPolicyGradientReadyOnCanvas && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
                    Training finished—use Evaluate to watch the policy
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
              Policy updates
              <InfoTooltip description="Completed policy gradient steps versus the target for this run. Keep training extends the run; Clear resets policy training progress." />
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
            aria-label="Policy update progress"
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
              Generations
              <InfoTooltip description="Current generation index versus the target for this session. Each generation evaluates the full population." />
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
            aria-label="Evolution generation progress"
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

      <div
        className={cn(
          "shrink-0",
          (isHuman || activeMode === "imitation" || activeMode === "policy-gradient" || activeMode === "evolution") &&
            (showObservationInspector ? "grid grid-cols-[2fr_3fr] gap-4" : "grid grid-cols-1 gap-4"),
        )}
      >
        {isHuman && (
          <div className="min-w-0">
            {scoreHistory.length > 0 ? (
              <ChartContainer data={scoreHistory} label="Scores over time" color="var(--primary)" />
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Scores over time
                </span>
                <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-border">
                  <span className="text-xs text-muted-foreground">No scores yet—play a few runs</span>
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
                tooltip="Cross-entropy loss vs recorded labels. Lower is a closer fit. One point per epoch."
              />
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  Training Loss
                  <InfoTooltip description="Same metric as the chart: one value per training epoch." />
                </span>
                <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-border">
                  <span className="text-xs text-muted-foreground">
                    {imitState?.datasetSize === 0 ? "Need data first" : "Hit Train to plot this"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        {activeMode === "policy-gradient" && (
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:gap-3">
            <div className="min-w-0">
              {pgState?.returnHistory && pgState.returnHistory.length > 0 ? (
                <ChartContainer
                  data={pgState.returnHistory}
                  label="Avg episode score (stochastic)"
                  color="var(--accent)"
                  tooltip="Mean episode distance per batch of rollouts. Stochastic sampling makes this noisy even when learning is improving."
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    Avg episode score (stochastic)
                    <InfoTooltip description="Noisy because actions are sampled during training. Compare with Greedy eval for a deterministic readout." />
                  </span>
                  <div className="flex h-[160px] items-center justify-center rounded-md border border-dashed border-border">
                    <span className="text-xs text-muted-foreground">Train to plot this curve</span>
                  </div>
                </div>
              )}
            </div>
            <div className="min-w-0">
              {pgState?.greedyEvalHistory && pgState.greedyEvalHistory.length > 0 ? (
                <ChartContainer
                  data={pgState.greedyEvalHistory}
                  label="Greedy policy (mean score)"
                  color="var(--primary)"
                  tooltip="After each policy update: deterministic greedy episodes on fixed seeds. Auto jump τ searches τ; manual mode uses your threshold."
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    Greedy policy (mean score)
                    <InfoTooltip description="Appears after the first update, using the same seeds each time for comparable runs. If greedy eval jumps too often, adjust Auto jump τ or manual τ." />
                  </span>
                  <div className="flex h-[160px] items-center justify-center rounded-md border border-dashed border-border">
                    <span className="text-xs text-muted-foreground">Appears after each policy update</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {activeMode === "evolution" && (
          <div className="min-w-0">
            {evState?.fitnessHistory && evState.fitnessHistory.length > 0 ? (
              <ChartContainer
                data={evState.fitnessHistory}
                label="Best Fitness"
                color="var(--accent)"
                tooltip="Best fitness each generation, averaged over evaluation seeds so one lucky layout does not dominate."
              />
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  Best Fitness
                  <InfoTooltip description="Same as the chart: mean over evaluation seeds to reduce variance from a single seed." />
                </span>
                <div className="h-[180px] flex items-center justify-center rounded-md border border-dashed border-border">
                  <span className="text-xs text-muted-foreground">Run Evolve to plot fitness</span>
                </div>
              </div>
            )}
          </div>
        )}
        {showObservationInspector && <ObservationInspector
          observations={
            (showGame || activeMode === "imitation" || activeMode === "policy-gradient") && runner.state
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
                    { label: "Gap ahead", value: obs[0], max: 1, displayValue: String(Math.floor(rawDist)) },
                    { label: "Obstacle width", value: obs[1], max: 1, displayValue: String(Math.round(nextObs?.width ?? 0)) },
                    { label: "Obstacle height", value: obs[2], max: 1, displayValue: String(Math.round(nextObs?.height ?? 0)) },
                    { label: "Player height", value: obs[3], max: 1, displayValue: s.playerY.toFixed(1) },
                    { label: "Vertical speed", value: obs[4], max: 1, displayValue: s.playerVy.toFixed(2) },
                    { label: "Run speed", value: obs[5], max: 1, displayValue: s.gameSpeed.toFixed(2) },
                    { label: "Headroom", value: obs[6], max: 1, displayValue: obs[6].toFixed(2) },
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
              <InfoTooltip description="Cross-entropy loss when the last training run stopped. Lower means predictions are closer to your labels." />
            </span>
            <span className="text-lg font-mono font-semibold tabular-nums text-primary">
              {imitState?.finalLoss != null ? imitState.finalLoss.toFixed(4) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              Precision
              <InfoTooltip description="Fraction of predicted jumps that matched a jump in your data (true positives over predicted positives)." />
            </span>
            <span className="text-lg font-mono font-semibold tabular-nums text-primary">
              {imitState?.metrics ? imitState.metrics.precision.toFixed(3) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              Recall
              <InfoTooltip description="Fraction of your actual jumps that the model also predicted (true positives over actual jumps)." />
            </span>
            <span className="text-lg font-mono font-semibold tabular-nums text-primary">
              {imitState?.metrics ? imitState.metrics.recall.toFixed(3) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              F1
              <InfoTooltip description="Harmonic mean of precision and recall on your full recorded dataset at the current jump threshold. 1.0 means both metrics are perfect." />
            </span>
            <span className="text-lg font-mono font-semibold tabular-nums text-accent">
              {imitState?.metrics ? imitState.metrics.f1.toFixed(3) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground">Best eval score</span>
            <span className="text-lg font-mono font-semibold tabular-nums text-accent">
              {(imitState?.evalRunCount ?? 0) > 0 ? imitState?.bestEvalScore : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground">Eval runs</span>
            <span className="text-lg font-mono font-semibold tabular-nums text-primary">
              {imitState?.evalRunCount ?? 0}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
