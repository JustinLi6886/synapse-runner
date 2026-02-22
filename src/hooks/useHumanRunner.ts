import { useMemo, useEffect } from "react"
import { HumanController } from "@/ai/controller"
import { useGameRunner } from "./useGameRunner"

export interface UseHumanRunnerOptions {
  paused: boolean
  viewWidth?: number
  started?: boolean
}

export function useHumanRunner({ paused, viewWidth = 800, started = true }: UseHumanRunnerOptions) {
  const controller = useMemo(() => new HumanController(), [])

  useEffect(() => {
    if (paused) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.code === "ArrowUp") && !e.repeat) {
        e.preventDefault()
        controller.setJumpPressed(true)
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [paused, controller])

  return useGameRunner({ controller, paused, viewWidth, started })
}
