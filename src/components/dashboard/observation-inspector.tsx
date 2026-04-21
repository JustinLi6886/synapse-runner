import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface ObservationFeature {
  label: string
  value: number
  max: number
  displayValue?: string
}

const DEFAULT_OBSERVATIONS: ObservationFeature[] = [
  { label: "Gap ahead", value: 1, max: 1, displayValue: "0" },
  { label: "Obstacle width", value: 0, max: 1, displayValue: "0" },
  { label: "Obstacle height", value: 0, max: 1, displayValue: "0" },
  { label: "Player height", value: 0, max: 1, displayValue: "0.0" },
  { label: "Vertical speed", value: 0.5, max: 1, displayValue: "0.00" },
  { label: "Run speed", value: 0.2, max: 1, displayValue: "1.00" },
  { label: "Headroom", value: 0, max: 1, displayValue: "0.00" },
]

interface ObservationInspectorProps {
  observations?: ObservationFeature[]
  className?: string
}

export function ObservationInspector({ observations: observationsOverride, className }: ObservationInspectorProps = {}) {
  const [isOpen, setIsOpen] = useState(true)
  const observations: ObservationFeature[] = observationsOverride ?? DEFAULT_OBSERVATIONS

  return (
    <div className={cn("rounded-xl bg-card border border-border", className)}>
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
          Input vector (normalized)
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
              feature.label === "Obstacle width" || feature.label === "Obstacle height"
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
