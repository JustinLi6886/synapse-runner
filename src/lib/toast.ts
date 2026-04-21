export type ToastVariant = "success" | "error"

export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

const store: ToastItem[] = []
let seq = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function push(message: string, variant: ToastVariant) {
  const id = ++seq
  store.push({ id, message, variant })
  emit()
  window.setTimeout(() => {
    const i = store.findIndex((t) => t.id === id)
    if (i >= 0) {
      store.splice(i, 1)
      emit()
    }
  }, 4200)
}

export const toast = {
  success: (message: string) => push(message, "success"),
  error: (message: string) => push(message, "error"),
}

export function getToastSnapshot(): ToastItem[] {
  return store.slice()
}

export function subscribeToasts(onStoreChange: () => void) {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}
