export const INSTRUMENTS = [
  { id: 'electric_guitar', label: 'Guitarra eléctrica' },
  { id: 'guitar', label: 'Guitarra acústica' },
  { id: 'bass', label: 'Bajo' },
  { id: 'drums', label: 'Batería' },
  { id: 'piano', label: 'Piano' },
] as const

export type InstrumentId = (typeof INSTRUMENTS)[number]['id']

export const DEFAULT_INSTRUMENT: InstrumentId = 'electric_guitar'

export function isInstrument(value: string | null | undefined): value is InstrumentId {
  return INSTRUMENTS.some((item) => item.id === value)
}

export function instrumentLabel(id: InstrumentId): string {
  return INSTRUMENTS.find((item) => item.id === id)?.label ?? 'Guitarra eléctrica'
}
