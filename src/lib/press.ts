import type { MouseEvent, PointerEvent } from 'react'

const LONG_PRESS_MS = 450

// One press happens at a time, so a single shared state serves every pressable element.
let timer: ReturnType<typeof setTimeout> | undefined
let touchPress = false
let handled = false

const cancel = () => {
  clearTimeout(timer)
  timer = undefined
}

/** Short buzz where supported (Android); iOS Safari has no vibration API. */
export const haptic = (ms = 10) => navigator.vibrate?.(ms)

/**
 * Tap → `onTap`. Long-press on touch, or right-click with a mouse → `onLongPress`.
 * Android also fires `contextmenu` on long-press; whichever comes first wins, once.
 */
export function pressHandlers(onTap: (e: MouseEvent) => void, onLongPress: () => void) {
  const long = () => {
    cancel()
    if (handled) return
    handled = true
    if (touchPress) haptic()
    onLongPress()
  }
  return {
    onPointerDown(e: PointerEvent) {
      cancel()
      touchPress = e.pointerType !== 'mouse'
      handled = false
      if (touchPress) timer = setTimeout(long, LONG_PRESS_MS)
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    // Fires when the finger starts scrolling instead.
    onPointerCancel: cancel,
    onContextMenu(e: MouseEvent) {
      e.preventDefault()
      long()
    },
    onClick(e: MouseEvent) {
      // The click that trails a touch long-press isn't a tap.
      if (touchPress && handled) {
        handled = false
        return
      }
      onTap(e)
    },
  }
}
