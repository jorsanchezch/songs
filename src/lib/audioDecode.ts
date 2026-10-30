import { ANALYSIS_RATE, analyzeAudio, type AnalyzeOptions, type AudioAnalysis } from '@/lib/audioAnalysis'
import { audioSource } from '@/lib/api'

const results = new Map<string, AudioAnalysis>()
/** Decoded audio of the last song analyzed, so a different tempo level can be tried without downloading again. */
let lastSamples: { url: string; samples: Float32Array } | null = null

export const cachedAnalysis = (url: string, bpm?: number) => results.get(key(url, bpm)) ?? null
const key = (url: string, bpm?: number) => `${url}|${bpm ?? ''}`

async function decode(url: string): Promise<Float32Array> {
  if (lastSamples?.url === url) return lastSamples.samples
  const source = await audioSource(url)
  const response = await fetch(source)
  if (!response.ok) throw new Error('No se pudo leer el MP3.')
  const bytes = await response.arrayBuffer()
  const context = new OfflineAudioContext(1, 1, ANALYSIS_RATE)
  const buffer = await context.decodeAudioData(bytes)
  // The context resamples to ANALYSIS_RATE; fold the channels to one.
  const mono = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < data.length; i += 1) mono[i] = mono[i]! + data[i]! / buffer.numberOfChannels
  }
  lastSamples = { url, samples: mono }
  return mono
}

/** Downloads, decodes and analyzes an MP3 in the browser. Results are kept for the visit. */
export async function analyzeUrl(url: string, options: AnalyzeOptions = {}): Promise<AudioAnalysis> {
  const hit = results.get(key(url, options.bpm))
  if (hit && !options.beatsPerBar) return hit
  options.onProgress?.(0)
  const samples = await decode(url)
  const analysis = await analyzeAudio(samples, ANALYSIS_RATE, options)
  results.set(key(url, options.bpm), analysis)
  return analysis
}
