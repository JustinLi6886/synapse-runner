import { User, Eye, Zap, Dna } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface Mode {
  id: string
  title: string
  description: string
  icon: LucideIcon
}

const modes: Mode[] = [
  {
    id: "human",
    title: "Human",
    description: "You control the run (keyboard or tap)",
    icon: User,
  },
  {
    id: "imitation",
    title: "Imitation Learning",
    description: "Behavioral cloning from your demos",
    icon: Eye,
  },
  {
    id: "policy-gradient",
    title: "Policy Gradient (RL)",
    description: "Actor–critic on game rewards",
    icon: Zap,
  },
  {
    id: "evolution",
    title: "Evolution Strategy",
    description: "Population search—mutate and select",
    icon: Dna,
  },
]

interface ModeSelectorProps {
  activeMode: string
  onModeChange: (mode: string) => void
  modeLocked?: boolean
}

function modeActiveStyles(modeId: string): { button: string; icon: string } {
  switch (modeId) {
    case "imitation":
      return {
        button:
          "border-emerald-400 bg-emerald-500/10 text-card-foreground shadow-[inset_0_0_0_1px_rgba(52,211,153,0.22)]",
        icon: "bg-emerald-500/20 text-emerald-400",
      }
    case "policy-gradient":
      return {
        button:
          "border-amber-400 bg-amber-500/10 text-card-foreground shadow-[inset_0_0_0_1px_rgba(251,191,36,0.22)]",
        icon: "bg-amber-500/20 text-amber-400",
      }
    case "evolution":
      return {
        button:
          "border-red-500 bg-red-500/10 text-card-foreground shadow-[inset_0_0_0_1px_rgba(239,68,68,0.2)]",
        icon: "bg-red-500/20 text-red-500",
      }
    default:
      return {
        button:
          "border-primary bg-primary/10 text-card-foreground shadow-[inset_0_0_0_1px_rgba(59,130,246,0.15)]",
        icon: "bg-primary/20 text-primary",
      }
  }
}

function modeInactiveStyles(modeId: string): { button: string; icon: string; title: string } {
  switch (modeId) {
    case "imitation":
      return {
        button:
          "border-emerald-500/25 bg-emerald-500/[0.06] text-muted-foreground hover:border-emerald-400/45 hover:bg-emerald-500/10 hover:text-card-foreground",
        icon: "bg-emerald-500/10 text-emerald-500/55",
        title: "text-muted-foreground group-hover:text-card-foreground",
      }
    case "policy-gradient":
      return {
        button:
          "border-amber-500/25 bg-amber-500/[0.06] text-muted-foreground hover:border-amber-400/45 hover:bg-amber-500/10 hover:text-card-foreground",
        icon: "bg-amber-500/10 text-amber-500/55",
        title: "text-muted-foreground group-hover:text-card-foreground",
      }
    case "evolution":
      return {
        button:
          "border-red-500/25 bg-red-500/[0.06] text-muted-foreground hover:border-red-500/45 hover:bg-red-500/10 hover:text-card-foreground",
        icon: "bg-red-500/10 text-red-500/55",
        title: "text-muted-foreground group-hover:text-card-foreground",
      }
    default:
      return {
        button:
          "border-primary/30 bg-primary/[0.06] text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-card-foreground",
        icon: "bg-primary/10 text-primary/60",
        title: "text-muted-foreground group-hover:text-card-foreground",
      }
  }
}

export function ModeSelector({ activeMode, onModeChange, modeLocked }: ModeSelectorProps) {
  const primaryModes = modes.filter((m) => m.id === "human" || m.id === "imitation")
  const otherModes = modes.filter((m) => m.id !== "human" && m.id !== "imitation")

  const renderMode = (mode: Mode, showDescription = true) => {
    const isActive = activeMode === mode.id
    const Icon = mode.icon
    const accent = modeActiveStyles(mode.id)
    const muted = modeInactiveStyles(mode.id)
    return (
      <button
        key={mode.id}
        type="button"
        disabled={modeLocked}
        onClick={() => onModeChange(mode.id)}
        role="radio"
        aria-checked={isActive}
        aria-label={`${mode.title}: ${mode.description}`}
        className={cn(
          "group flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          isActive ? accent.button : muted.button,
          modeLocked && "opacity-50 cursor-not-allowed"
        )}
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
            isActive ? accent.icon : muted.icon
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span
            className={cn(
              "text-sm font-medium leading-none transition-colors",
              isActive ? "text-card-foreground" : muted.title
            )}
          >
            {mode.title}
          </span>
          {showDescription && (
            <span className="text-[11px] leading-none text-muted-foreground/90 group-hover:text-muted-foreground">
              {mode.description}
            </span>
          )}
        </div>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="How to run or train the agent">
      <span className="text-[11px] text-muted-foreground leading-snug">
        Choose who drives, then set training options in the panel below.
      </span>
      <div className="grid grid-cols-2 gap-2">
        {primaryModes.map((m) => renderMode(m, false))}
      </div>
      <div className="flex flex-col gap-2">
        {otherModes.map((m) => renderMode(m))}
      </div>
    </div>
  )
}
