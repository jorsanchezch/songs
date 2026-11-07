/** Landing offset under the sticky header (`scroll-margin-top`). */
export const VIEWPORT_JUMP_SCROLL_MARGIN_PX = 8

/** Collapsed PlaybackDock (size-20) sits in the chart strip above the footer. */
export const VIEWPORT_JUMP_DOCK_RESERVE_PX = 92

/** Breathing room / safe-area after header, footer, dock, and scroll margin. */
export const VIEWPORT_JUMP_SLACK_PX = 32

/** When a part is taller than the screen, jump every N chart lines. */
export const VIEWPORT_JUMP_LINES = 4

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
 * If the part fits in `usableHeight`, one jump. Otherwise equal chunks of `linesPerSlice` lines
 * (last chunk may be shorter).
 */
export function sliceStartLines(
  lineHeights: number[],
  usableHeight: number,
  linesPerSlice = VIEWPORT_JUMP_LINES,
): number[] {
  if (lineHeights.length === 0) return [0]
  const total = lineHeights.reduce((sum, height) => sum + Math.max(0, height), 0)
  const size = Math.max(1, linesPerSlice)
  if (usableHeight <= 0 || total <= usableHeight || lineHeights.length <= size) return [0]

  const starts = [0]
  for (let index = size; index < lineHeights.length; index += size) {
    starts.push(index)
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

/** Line indexes (within a part) where a viewport jump starts after the first slice. */
export function sliceBreaksByBlock(steps: ViewportNavStep[]): Map<string, Map<number, string>> {
  const map = new Map<string, Map<number, string>>()
  for (const step of steps) {
    if (step.lineIndex == null || step.lineIndex <= 0) continue
    let lines = map.get(step.blockId)
    if (!lines) {
      lines = new Map()
      map.set(step.blockId, lines)
    }
    lines.set(step.lineIndex, step.label)
  }
  return map
}
