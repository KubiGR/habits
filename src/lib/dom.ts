export const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')

/** True when a keystroke belongs to a text field rather than a shortcut. */
export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
