import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalyzeOptions, AudioAnalysis } from '@/lib/audioAnalysis'
import { analyzeUrl, cachedAnalysis } from '@/lib/audioDecode'

export type AudioAnalysisState = {
  result: AudioAnalysis | null
  running: boolean
  progress: number
  error: string
  /** Analyze (or re-analyze counting the pulse at `options.bpm`). */
  run: (options?: AnalyzeOptions) => Promise<AudioAnalysis | null>
}

/** On-demand analysis of one MP3; a result already computed this visit is shown right away. */
export function useAudioAnalysis(url: string | null): AudioAnalysisState {
  const [result, setResult] = useState<AudioAnalysis | null>(() => (url ? cachedAnalysis(url) : null))
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const current = useRef(url)
  current.current = url

  useEffect(() => {
    setResult(url ? cachedAnalysis(url) : null)
    setRunning(false)
    setError('')
  }, [url])

  const run = useCallback(
    async (options: AnalyzeOptions = {}) => {
      if (!url) return null
      setRunning(true)
      setError('')
      setProgress(0)
      try {
        const analysis = await analyzeUrl(url, { ...options, onProgress: setProgress })
        if (current.current === url) setResult(analysis)
        return analysis
      } catch (reason) {
        if (current.current === url) setError(reason instanceof Error ? reason.message : 'No pude analizar el audio.')
        return null
      } finally {
        if (current.current === url) setRunning(false)
      }
    },
    [url],
  )

  return { result, running, progress, error, run }
}
