export const INSTRUMENTS = ['electric_guitar', 'guitar', 'bass', 'drums', 'piano'] as const

export type InstrumentId = (typeof INSTRUMENTS)[number]

export const DEFAULT_INSTRUMENT: InstrumentId = 'electric_guitar'

export function isInstrument(value: string | null | undefined): value is InstrumentId {
  return INSTRUMENTS.includes(value as InstrumentId)
}
