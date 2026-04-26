import { useRef } from "react"
import { Download, Github, Upload, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { APP_VERSION } from "@/version"
import { toast } from "@/lib/toast"
import { MAX_FILE_READ_BYTES } from "@/lib/sanitize"
import type { ImitationState, ImitationActions } from "@/hooks/useImitation"
import type { PolicyGradientState, PolicyGradientActions } from "@/hooks/usePolicyGradient"
import type { EvolutionState, EvolutionActions } from "@/hooks/useEvolution"

interface TopNavProps {
  activeMode?: string
  theme: "light" | "dark"
  onThemeChange: (theme: "light" | "dark") => void
  fileActionsDisabled?: boolean
  leftPanelOpen: boolean
  onLeftPanelToggle: () => void
  imitation?: [ImitationState, ImitationActions]
  policyGradient?: [PolicyGradientState, PolicyGradientActions]
  evolution?: [EvolutionState, EvolutionActions]
}

export function TopNav({
  activeMode,
  theme,
  onThemeChange,
  fileActionsDisabled,
  leftPanelOpen,
  onLeftPanelToggle,
  imitation,
  policyGradient,
  evolution,
}: TopNavProps) {
  const modelFileRef = useRef<HTMLInputElement>(null)
  const pgModelFileRef = useRef<HTMLInputElement>(null)
  const evModelFileRef = useRef<HTMLInputElement>(null)
  const showImitationModelControls = activeMode === "imitation" && imitation
  const showPgModelControls = activeMode === "policy-gradient" && policyGradient
  const showEvolutionModelControls = activeMode === "evolution" && evolution
  const [imitState, imitActions] = imitation ?? [undefined, undefined]
  const [pgState, pgActions] = policyGradient ?? [undefined, undefined]
  const [evState, evActions] = evolution ?? [undefined, undefined]
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onLeftPanelToggle}
          aria-label={leftPanelOpen ? "Hide side panel" : "Show side panel"}
          aria-expanded={leftPanelOpen}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "hover:bg-secondary hover:text-card-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          {leftPanelOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>

        <div className="h-4 w-px bg-border" aria-hidden="true" />

        <div className="flex items-center gap-2">
          <img
            src="/SR.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 object-contain"
            decoding="async"
          />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            SYNAPSE RUNNER
          </span>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground" title={`Version ${APP_VERSION}`}>
            v{APP_VERSION}
          </span>
          <a
            href="https://github.com/JustinLi6886/synapse-runner"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            className={cn(
              "ml-0.5 flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors",
              "hover:bg-secondary hover:text-card-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <Github className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-[11px] font-medium">GitHub</span>
          </a>
          <a
            href="https://github.com/JustinLi6886"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "text-[11px] font-medium text-muted-foreground whitespace-nowrap select-none transition-colors",
              "hover:text-foreground hover:underline underline-offset-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm",
            )}
          >
            Made by Justin Li
          </a>
          <button
            type="button"
            onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
            className={cn(
              "ml-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors",
              "hover:bg-secondary hover:text-card-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            {theme === "dark" ? <Sun className="h-4 w-4 shrink-0" aria-hidden /> : <Moon className="h-4 w-4 shrink-0" aria-hidden />}
            <span className="text-[11px] font-medium">Theme</span>
          </button>
        </div>

      </div>

      {(showImitationModelControls || showPgModelControls || showEvolutionModelControls) && (
        <div className="flex items-center gap-3 shrink-0">
          {showImitationModelControls ? (
            <>
              <button
                onClick={() => modelFileRef.current?.click()}
                disabled={fileActionsDisabled}
                aria-label="Load model from JSON file"
                className={cn(
                  "flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground transition-colors",
                  "hover:bg-secondary/80",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  fileActionsDisabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Load model
              </button>
              <input
                ref={modelFileRef}
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    if (file.size > MAX_FILE_READ_BYTES) {
                      toast.error("File is too large to import here")
                    } else {
                      void file.text().then(imitActions!.importModel).catch(() => {
                        toast.error("Could not read that file")
                      })
                    }
                  }
                  e.target.value = ""
                }}
                className="hidden"
              />
              <button
                onClick={imitActions?.exportModel}
                disabled={!imitState?.model || fileActionsDisabled}
                aria-label="Save model to JSON file"
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  imitState?.model && !fileActionsDisabled
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-secondary text-secondary-foreground opacity-50 cursor-not-allowed"
                )}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Save model
              </button>
            </>
          ) : showPgModelControls ? (
            <>
              <button
                onClick={() => pgModelFileRef.current?.click()}
                disabled={fileActionsDisabled}
                aria-label="Load model from JSON file"
                className={cn(
                  "flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground transition-colors",
                  "hover:bg-secondary/80",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  fileActionsDisabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Load model
              </button>
              <input
                ref={pgModelFileRef}
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    if (file.size > MAX_FILE_READ_BYTES) {
                      toast.error("File is too large to import here")
                    } else {
                      void file.text().then(pgActions!.importModel).catch(() => {
                        toast.error("Could not read that file")
                      })
                    }
                  }
                  e.target.value = ""
                }}
                className="hidden"
              />
              <button
                onClick={pgActions?.exportModel}
                disabled={!pgState?.model || fileActionsDisabled}
                aria-label="Save model to JSON file"
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  pgState?.model && !fileActionsDisabled
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-secondary text-secondary-foreground opacity-50 cursor-not-allowed"
                )}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Save model
              </button>
            </>
          ) : showEvolutionModelControls ? (
            <>
              <button
                onClick={() => evModelFileRef.current?.click()}
                disabled={fileActionsDisabled}
                aria-label="Load evolved network from JSON file"
                className={cn(
                  "flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground transition-colors",
                  "hover:bg-secondary/80",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  fileActionsDisabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Load model
              </button>
              <input
                ref={evModelFileRef}
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    if (file.size > MAX_FILE_READ_BYTES) {
                      toast.error("File is too large to import here")
                    } else {
                      void file.text().then(evActions!.importModel).catch(() => {
                        toast.error("Could not read that file")
                      })
                    }
                  }
                  e.target.value = ""
                }}
                className="hidden"
              />
              <button
                onClick={evActions?.exportModel}
                disabled={!evState?.model || fileActionsDisabled}
                aria-label="Save best evolved network to JSON file"
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  evState?.model && !fileActionsDisabled
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-secondary text-secondary-foreground opacity-50 cursor-not-allowed"
                )}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Save model
              </button>
            </>
          ) : null}
        </div>
      )}
    </header>
  )
}
