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
    description: "Manual keyboard control",
    icon: User,
  },
  {
    id: "imitation",
    title: "Imitation Learning",
    description: "Supervised behavioral cloning",
    icon: Eye,
  },
  {
    id: "policy-gradient",
    title: "Policy Gradient (RL)",
    description: "REINFORCE with baseline",
    icon: Zap,
  },
  {
    id: "evolution",
    title: "Evolution Strategy",
    description: "Population-based optimization",
    icon: Dna,
  },
]

interface ModeSelectorProps {
  activeMode: string
  onModeChange: (mode: string) => void
}

export function ModeSelector({ activeMode, onModeChange }: ModeSelectorProps) {
  const primaryModes = modes.filter((m) => m.id === "human" || m.id === "imitation")
  const otherModes = modes.filter((m) => m.id !== "human" && m.id !== "imitation")

  const renderMode = (mode: Mode, showDescription = true) => {
    const isActive = activeMode === mode.id
    const Icon = mode.icon
    return (
      <button
        key={mode.id}
        onClick={() => onModeChange(mode.id)}
        role="radio"
        aria-checked={isActive}
        aria-label={`${mode.title}: ${mode.description}`}
        className={cn(
          "flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          isActive
            ? "border-primary bg-primary/10 text-card-foreground shadow-[inset_0_0_0_1px_rgba(59,130,246,0.15)]"
            : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:bg-secondary/50 hover:text-card-foreground"
        )}
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
            isActive
              ? "bg-primary/20 text-primary"
              : "bg-secondary text-muted-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={cn(
            "text-sm font-medium leading-none",
            isActive ? "text-card-foreground" : ""
          )}>
            {mode.title}
          </span>
          {showDescription && (
            <span className="text-[11px] leading-none text-muted-foreground">
              {mode.description}
            </span>
          )}
        </div>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Training mode selector">
      <span className="text-[11px] text-muted-foreground leading-snug">
        Play manually, then train the AI to copy your gameplay.
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
