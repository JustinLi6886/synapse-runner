import { cn } from "@/lib/utils"

interface MetricTileProps {
  label: string
  value: string | number
  unit?: string
  highlight?: boolean
}

export function MetricTile({ label, value, unit, highlight = false }: MetricTileProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-3 transition-colors",
        "bg-card border-border hover:border-primary/30",
        "min-h-[68px]"
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-xl font-mono font-semibold tabular-nums leading-none",
            highlight ? "text-primary" : "text-card-foreground"
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[11px] text-muted-foreground">{unit}</span>
        )}
      </div>
    </div>
  )
}
