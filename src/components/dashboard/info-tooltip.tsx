import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"

export function InfoTooltip({ description }: { description: string }) {
  const [hovered, setHovered] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!hovered || !ref.current) return
    const update = () => {
      if (ref.current) {
        const r = ref.current.getBoundingClientRect()
        setPos({ top: r.top + r.height / 2, left: r.right + 8 })
      }
    }
    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [hovered])

  return (
    <>
      <span
        ref={ref}
        className="inline-flex cursor-help"
        aria-label={description}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
      </span>
      {hovered &&
        createPortal(
          <span
            className={cn(
              "fixed z-[9999] px-4 py-3 rounded-lg -translate-y-1/2",
              "text-sm font-normal text-popover-foreground bg-popover border border-border shadow-lg",
              "min-w-[280px] max-w-[400px] whitespace-normal leading-relaxed",
              "pointer-events-none"
            )}
            style={{ top: pos.top, left: pos.left }}
          >
            {description}
          </span>,
          document.body
        )}
    </>
  )
}
