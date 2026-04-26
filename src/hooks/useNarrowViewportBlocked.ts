import { useEffect, useState } from "react"

export const NARROW_APP_WIDTH_PX = 720

function effectiveLayoutWidth(): number {
  if (typeof window === "undefined") return NARROW_APP_WIDTH_PX
  const vv = window.visualViewport
  return Math.min(window.innerWidth, vv?.width ?? window.innerWidth)
}

export function useNarrowViewportBlocked(): boolean {
  const [blocked, setBlocked] = useState(
    () => typeof window !== "undefined" && effectiveLayoutWidth() < NARROW_APP_WIDTH_PX,
  )

  useEffect(() => {
    const update = () => {
      setBlocked(effectiveLayoutWidth() < NARROW_APP_WIDTH_PX)
    }
    update()
    window.addEventListener("resize", update)
    const vv = window.visualViewport
    vv?.addEventListener("resize", update)
    vv?.addEventListener("scroll", update)
    return () => {
      window.removeEventListener("resize", update)
      vv?.removeEventListener("resize", update)
      vv?.removeEventListener("scroll", update)
    }
  }, [])

  return blocked
}
