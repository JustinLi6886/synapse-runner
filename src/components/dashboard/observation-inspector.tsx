import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { mockState } from "@/lib/mock-data"

export interface ObservationFeature {
  label: string
  value: number
  max: number
  displayValue?: string
}

interface ObservationInspectorProps {
  observations?: ObservationFeature[]
}

export function ObservationInspector({ observations: observationsOverride }: ObservationInspectorProps = {}) {
  const [isOpen, setIsOpen] = useState(true)
  const observations: ObservationFeature[] = observationsOverride ?? mockState.observations

  return (
    <div className="rounded-xl bg-card border border-border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="observation-panel"
        className={cn(
          "flex w-full items-center justify-between px-4 py-3 text-left transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          "hover:bg-secondary/40",
          isOpen ? "border-b border-border" : ""
        )}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Observation Inspector
        </h3>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div id="observation-panel" className="grid grid-cols-2 gap-3 p-4">
          {observations.map((feature) => {
            const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
            const normalized =
              feature.max === 1 ? feature.value : feature.value / feature.max
            const pct = clamp01(normalized) * 100
            const ariaValue = feature.max === 1 ? normalized : feature.value
            const animateBar =
              feature.label === "Obstacle Width" || feature.label === "Obstacle Height"
            return (
              <div key={feature.label} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {feature.label}
                  </span>
                  <span className="text-[11px] font-mono font-medium text-card-foreground tabular-nums">
                    {feature.displayValue ?? feature.value}
                  </span>
                </div>
                <div
                  className="h-1.5 w-full rounded-full bg-secondary"
                  role="meter"
                  aria-label={feature.label}
                  aria-valuenow={ariaValue}
                  aria-valuemin={0}
                  aria-valuemax={feature.max === 1 ? 1 : feature.max}
                >
                  <div
                    className={cn(
                      "h-full rounded-full bg-primary/60",
                      animateBar && "transition-all duration-300"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
