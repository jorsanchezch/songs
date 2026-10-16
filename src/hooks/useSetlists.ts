import { useEffect, useState } from 'react'
import { loadSetlists, subscribeSetlists, type Setlist } from '@/lib/setlists'

export function useSetlists(): Setlist[] {
  const [setlists, setSetlists] = useState<Setlist[]>(() => loadSetlists())
  useEffect(() => subscribeSetlists(() => setSetlists(loadSetlists())), [])
  return setlists
}
