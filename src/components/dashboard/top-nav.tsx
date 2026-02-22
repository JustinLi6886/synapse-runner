import { useRef } from "react"
import { Download, Upload, Hash, Activity, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ImitationState, ImitationActions } from "@/hooks/useImitation"
import type { PolicyGradientState, PolicyGradientActions } from "@/hooks/usePolicyGradient"

interface TopNavProps {
  activeMode?: string
  isHeadless: boolean
  onHeadlessToggle: () => void
  leftPanelOpen: boolean
  onLeftPanelToggle: () => void
  seed?: number | null
  imitation?: [ImitationState, ImitationActions]
  policyGradient?: [PolicyGradientState, PolicyGradientActions]
}

export function TopNav({ activeMode, isHeadless, onHeadlessToggle, leftPanelOpen, onLeftPanelToggle, seed, imitation, policyGradient }: TopNavProps) {
  const modelFileRef = useRef<HTMLInputElement>(null)
  const pgModelFileRef = useRef<HTMLInputElement>(null)
  const showTrainingControls = activeMode === "policy-gradient" || activeMode === "evolution"
  const showImitationModelControls = activeMode === "imitation" && imitation
  const showPgModelControls = activeMode === "policy-gradient" && policyGradient
  const [imitState, imitActions] = imitation ?? [undefined, undefined]
  const [pgState, pgActions] = policyGradient ?? [undefined, undefined]
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onLeftPanelToggle}
          aria-label={leftPanelOpen ? "Collapse AI Lab panel" : "Expand AI Lab panel"}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
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
          <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            SYNAPSE RUNNER
          </span>
        </div>

        <div className="h-4 w-px bg-border" aria-hidden="true" />

        <div className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1">
          <Hash className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
            seed: {seed ?? "—"}
          </span>
        </div>
      </div>

      {(showTrainingControls || showImitationModelControls || showPgModelControls) && (
        <div className="flex items-center gap-3">
          {showTrainingControls && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Headless</span>
            <button
              onClick={onHeadlessToggle}
              role="switch"
              aria-checked={isHeadless}
              aria-label="Toggle headless training mode"
              className={cn(
                "relative flex h-5 w-9 cursor-pointer items-center rounded-full px-0.5 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isHeadless ? "bg-primary" : "bg-secondary"
              )}
            >
              <div
                className={cn(
                  "h-4 w-4 rounded-full transition-transform",
                  isHeadless ? "translate-x-4 bg-primary-foreground" : "translate-x-0 bg-muted-foreground"
                )}
              />
            </button>
          </div>
          )}

          {showTrainingControls && <div className="h-4 w-px bg-border" aria-hidden="true" />}

          {showImitationModelControls ? (
            <>
              <button
                onClick={() => modelFileRef.current?.click()}
                aria-label="Import model"
                className={cn(
                  "flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground transition-colors",
                  "hover:bg-secondary/80",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Import Model
              </button>
              <input
                ref={modelFileRef}
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) file.text().then(imitActions!.importModel)
                  e.target.value = ""
                }}
                className="hidden"
              />
              <button
                onClick={imitActions?.exportModel}
                disabled={!imitState?.model}
                aria-label="Export model"
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  imitState?.model
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-secondary text-secondary-foreground opacity-50 cursor-not-allowed"
                )}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Export Model
              </button>
            </>
          ) : showPgModelControls ? (
            <>
              <button
                onClick={() => pgModelFileRef.current?.click()}
                aria-label="Import model"
                className={cn(
                  "flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground transition-colors",
                  "hover:bg-secondary/80",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Import Model
              </button>
              <input
                ref={pgModelFileRef}
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) file.text().then(pgActions!.importModel)
                  e.target.value = ""
                }}
                className="hidden"
              />
              <button
                onClick={pgActions?.exportModel}
                disabled={!pgState?.model}
                aria-label="Export model"
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  pgState?.model
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-secondary text-secondary-foreground opacity-50 cursor-not-allowed"
                )}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Export Model
              </button>
            </>
          ) : showTrainingControls ? (
            <>
          <button
            aria-label="Import configuration"
            className={cn(
              "flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground transition-colors",
              "hover:bg-secondary/80",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Import
          </button>

          <button
            aria-label="Export run data"
            className={cn(
              "flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition-colors",
              "hover:bg-primary/90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export
          </button>
            </>
          ) : null}
        </div>
      )}
    </header>
  )
}
