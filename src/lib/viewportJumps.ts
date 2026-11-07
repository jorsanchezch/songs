/** Landing offset under the sticky header (`scroll-margin-top`). */
export const VIEWPORT_JUMP_SCROLL_MARGIN_PX = 8

/** Collapsed PlaybackDock (size-20) sits in the chart strip above the footer. */
export const VIEWPORT_JUMP_DOCK_RESERVE_PX = 92

/** Breathing room / safe-area after header, footer, dock, and scroll margin. */
export const VIEWPORT_JUMP_SLACK_PX = 32

/**
 * Usable chart height for one live jump.
 * `chartGapPx` is the open strip between the sticky header bottom and the fixed footer top.
 */
export function usableJumpHeight(
  chartGapPx: number,
  extras = VIEWPORT_JUMP_SCROLL_MARGIN_PX + VIEWPORT_JUMP_DOCK_RESERVE_PX + VIEWPORT_JUMP_SLACK_PX,
): number {
  return Math.max(48, chartGapPx - extras)
}

/**
 * Start line indexes for scroll targets inside one part.
 * Packs consecutive lines while they fit in `usableHeight`; the last slice may be short.
 * A single oversized line still starts its own slice.
 */
export function sliceStartLines(lineHeights: number[], usableHeight: number): number[] {
  if (lineHeights.length === 0) return [0]
  const heights = lineHeights.map((height) => Math.max(0, height))
  const total = heights.reduce((sum, height) => sum + height, 0)
  if (usableHeight <= 0 || total <= usableHeight) return [0]

  const starts = [0]
  let filled = 0
  for (let index = 0; index < heights.length; index++) {
    const height = heights[index]!
    if (filled > 0 && filled + height > usableHeight) {
      starts.push(index)
      filled = 0
    }
    filled += height
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
