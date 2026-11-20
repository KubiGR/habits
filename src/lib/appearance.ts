export type Appearance = 'auto' | 'light' | 'dark'

// index.html reads this key too, so the saved choice applies before first paint.
const KEY = 'habits:appearance'

export function readAppearance(): Appearance {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

/** 'auto' follows the system; otherwise data-theme on <html> overrides it. */
export function applyAppearance(a: Appearance) {
  const root = document.documentElement
  if (a === 'auto') delete root.dataset.theme
  else root.dataset.theme = a
  try {
    localStorage.setItem(KEY, a)
  } catch {
    // Choice just won't persist.
  }
}

export const nextAppearance: Record<Appearance, Appearance> = { auto: 'light', light: 'dark', dark: 'auto' }
