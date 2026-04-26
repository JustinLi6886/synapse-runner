import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"

import { InfoTooltip } from "./info-tooltip"

interface ChartContainerProps {
  data: { name: string; value: number }[]
  label: string
  color?: string
  tooltip?: string
}

function formatYTick(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(1)
}

export function ChartContainer({ data, label, color = "var(--primary)", tooltip }: ChartContainerProps) {
  const hasPoints = data.length > 0
  return (
    <div
      className="flex flex-col gap-2"
      role="img"
      aria-label={hasPoints ? `${label} chart` : `${label} chart (no data yet)`}
    >
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {label}
        {tooltip && <InfoTooltip description={tooltip} />}
      </span>
      <div className="h-[180px] w-full">
        {!hasPoints ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-secondary/20 px-3 text-center text-xs text-muted-foreground">
            No data yet—metrics will appear as training or evaluation runs.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={formatYTick}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--foreground)",
                  padding: "8px 12px",
                }}
                cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "4 4" }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: color, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
