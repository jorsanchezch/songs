/** Slack between the sticky header, song footer, and the usable jump height. */
export const VIEWPORT_JUMP_SLACK_PX = 24

/** Usable chart height for one live jump: viewport minus chrome. */
export function usableJumpHeight(
  viewportHeight: number,
  headerHeight: number,
  footerHeight: number,
  slack = VIEWPORT_JUMP_SLACK_PX,
): number {
  return Math.max(48, viewportHeight - headerHeight - footerHeight - slack)
}

/**
 * Start line indexes for equal scroll targets inside one part.
 * Packs consecutive lines up to `usableHeight`; the last slice may be short.
 * A single oversized line still starts its own slice.
 */
export function sliceStartLines(lineHeights: number[], usableHeight: number): number[] {
  if (lineHeights.length === 0) return [0]
  const total = lineHeights.reduce((sum, height) => sum + Math.max(0, height), 0)
  if (usableHeight <= 0 || total <= usableHeight) return [0]

  const starts = [0]
  let filled = 0
  for (let index = 0; index < lineHeights.length - 1; index++) {
    filled += Math.max(0, lineHeights[index] ?? 0)
    if (filled >= usableHeight) {
      starts.push(index + 1)
      filled = 0
    }
  }
  return starts
}

/** `Verso 1a` / `Coro a` style labels for sub-jumps inside a part. */
export function sliceChipLabel(baseLabel: string, sliceIndex: number, sliceCount: number): string {
  if (sliceCount <= 1) return baseLabel
  const letter = sliceLetter(sliceIndex)
  const trimmed = baseLabel.trimEnd()
  if (/\d$/u.test(trimmed)) return `${trimmed}${letter}`
  return `${trimmed} ${letter}`
}

export function sliceLetter(index: number): string {
  if (index < 0) return 'a'
  if (index < 26) return String.fromCharCode(97 + index)
  return `${sliceLetter(Math.floor(index / 26) - 1)}${String.fromCharCode(97 + (index % 26))}`
}

export type ViewportNavStep = {
  key: string
  /** Block scrolled for this step (fold chip may list several). */
  blockId: string
  /** Line to land on; `null` means the section top. */
  lineIndex: number | null
  label: string
  /** Chip ids this step belongs to (for progress / active checks). */
  chipIds: string[]
  /** Progress weight for this step. */
  weight: number
}

export function sliceKey(blockId: string, lineIndex: number | null): string {
  return lineIndex == null ? blockId : `${blockId}#${lineIndex}`
}
