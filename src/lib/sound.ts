let context: AudioContext | null = null
let voices: OscillatorNode[] = []

/** Open strings of a guitar in standard tuning, low E first. */
const GUITAR = [40, 45, 50, 55, 59, 64]

function audio(): AudioContext {
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

function frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

export function stopSound() {
  for (const voice of voices) {
    try {
      voice.stop()
    } catch {
      // Already stopped.
    }
  }
  voices = []
}

export function playNotes(midis: number[], { at = 0, strum = 0, length = 1.6 } = {}) {
  const ctx = audio()
  const start = ctx.currentTime + 0.03 + at
  const level = 0.5 / Math.max(3, midis.length)
  midis.forEach((midi, index) => {
    const time = start + index * strum
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = frequency(midi)
    gain.gain.setValueAtTime(0, time)
    gain.gain.linearRampToValueAtTime(level, time + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length)
    osc.connect(gain).connect(ctx.destination)
    osc.start(time)
    osc.stop(time + length + 0.05)
    voices.push(osc)
    osc.onended = () => {
      voices = voices.filter((voice) => voice !== osc)
    }
  })
}

/** Plays chords one after another, cutting off anything still sounding. */
export function playSequence(chords: number[][], { gap = 1.1, strum = 0, length = 1.4 } = {}) {
  stopSound()
  chords.forEach((midis, index) => playNotes(midis, { at: index * gap, strum, length }))
}

export function guitarMidis(frets: number[]): number[] {
  return frets.flatMap((fret, string) => (fret < 0 ? [] : [(GUITAR[string] ?? 40) + fret]))
}

/** Piano notes are semitones above C3. */
export function pianoMidis(notes: number[]): number[] {
  return notes.map((note) => 48 + note)
}
