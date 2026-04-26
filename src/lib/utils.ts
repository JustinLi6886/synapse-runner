import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** True when the event is from a text field, select, or contenteditable (game keys should not run). */
export function eventTargetIsFormField(e: { target: EventTarget | null }): boolean {
  const t = e.target
  if (!t || !(t instanceof Element)) return false
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)
    return true
  if (t instanceof HTMLElement && t.isContentEditable) return true
  if (t instanceof Element) {
    if (t.closest('[role="textbox"], [role="combobox"], [role="searchbox"]')) return true
  }
  return t.closest("input, textarea, select, [contenteditable]") != null
}
