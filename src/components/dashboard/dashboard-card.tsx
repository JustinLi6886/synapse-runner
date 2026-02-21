import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface DashboardCardProps {
  title: string
  children: ReactNode
  action?: ReactNode
  className?: string
}

export function DashboardCard({ title, children, action, className }: DashboardCardProps) {
  return (
    <div className={cn("rounded-xl bg-card border border-border", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}
