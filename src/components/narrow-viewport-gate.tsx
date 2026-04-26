import { useLayoutEffect, useRef } from "react"
import { RotateCw, Smartphone } from "lucide-react"

export { NARROW_APP_WIDTH_PX } from "@/hooks/useNarrowViewportBlocked"

type NarrowViewportGateProps = {
  open: boolean
}

export function NarrowViewportGate({ open }: NarrowViewportGateProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    titleRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 overscroll-none bg-background/95 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center backdrop-blur-sm [-webkit-backdrop-filter:blur(4px)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="narrow-viewport-title"
    >
      <div className="flex flex-col items-center gap-5">
        <img
          src="/SR.png"
          alt="Synapse Runner"
          width={96}
          height={96}
          className="h-24 w-24 shrink-0 object-contain"
          decoding="async"
        />
        <div className="max-w-sm space-y-3">
          <h1
            ref={titleRef}
            id="narrow-viewport-title"
            tabIndex={-1}
            className="text-lg font-semibold leading-snug text-foreground outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            This view’s a little tight
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The dashboard opens up on a wider screen—try turning your phone sideways, dragging the
            window wider, or switching to a tablet or computer. We’ll be right here when you do.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-muted-foreground/80" aria-hidden="true">
          <Smartphone className="h-8 w-8 shrink-0" strokeWidth={1.5} />
          <RotateCw className="h-6 w-6 shrink-0" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  )
}
