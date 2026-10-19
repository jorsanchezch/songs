export const INSTRUMENTS = ['guitar', 'bass', 'drums', 'piano'] as const

export type InstrumentId = (typeof INSTRUMENTS)[number]

export function isInstrument(value: string | null | undefined): value is InstrumentId {
  return value === 'guitar' || value === 'bass' || value === 'drums' || value === 'piano'
}
