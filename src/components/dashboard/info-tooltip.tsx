import { useState, useRef, useEffect, useId } from "react"
import { createPortal } from "react-dom"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"

export function InfoTooltip({ description }: { description: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [useHover, setUseHover] = useState(
    () => typeof window === "undefined" || window.matchMedia("(hover: hover)").matches,
  )
  const ref = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const tipBodyId = useId()

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover)")
    const read = () => setUseHover(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])

  useEffect(() => {
    if (!open || !ref.current) return
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
  }, [open])

  useEffect(() => {
    if (useHover || !open) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node) || tipRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [useHover, open])

  return (
    <>
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={description}
        aria-expanded={!useHover ? open : undefined}
        className={cn(
          "inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          useHover ? "cursor-help" : "cursor-pointer"
        )}
        onMouseEnter={() => {
          if (useHover) setOpen(true)
        }}
        onMouseLeave={() => {
          if (useHover) setOpen(false)
        }}
        onFocus={() => {
          if (useHover) setOpen(true)
        }}
        onBlur={() => {
          if (useHover) setOpen(false)
        }}
        onClick={() => {
          if (!useHover) setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            (e.target as HTMLElement).blur()
            setOpen(false)
          }
        }}
      >
        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
      </span>
      {open &&
        createPortal(
          <span
            ref={tipRef}
            className={cn(
              "fixed z-[9999] px-4 py-3 rounded-lg -translate-y-1/2",
              "text-sm font-normal text-popover-foreground bg-popover border border-border shadow-lg",
              "max-w-[min(400px,calc(100vw-1.5rem))] min-w-0 sm:min-w-[240px] whitespace-normal leading-relaxed",
              useHover ? "pointer-events-none" : "pointer-events-auto"
            )}
            style={{ top: pos.top, left: pos.left }}
            id={tipBodyId}
            role="tooltip"
          >
            {description}
          </span>,
          document.body
        )}
    </>
  )
}
