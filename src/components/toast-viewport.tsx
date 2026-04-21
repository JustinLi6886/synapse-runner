import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { getToastSnapshot, subscribeToasts, type ToastItem } from "@/lib/toast"

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>(() => getToastSnapshot())
  useEffect(() => subscribeToasts(() => setItems(getToastSnapshot())), [])
  if (items.length === 0) return null
  return (
    <div
      className="pointer-events-none fixed top-4 left-1/2 z-[3000] flex w-[min(100vw-2rem,22rem)] -translate-x-1/2 flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto rounded-lg border px-3 py-2.5 text-sm shadow-md backdrop-blur-sm",
            t.variant === "success"
              ? "border-emerald-500/35 bg-card/95 text-card-foreground"
              : "border-destructive/45 bg-card/95 text-destructive",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
