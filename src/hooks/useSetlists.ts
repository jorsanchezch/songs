import { useEffect, useState } from 'react'
import { hydrateSetlists, loadServiceDays, loadSetlists, subscribeSetlists, type Setlist } from '@/lib/setlists'

export function useSetlists(): Setlist[] {
  const [setlists, setSetlists] = useState<Setlist[]>(() => loadSetlists())
  useEffect(() => {
    const unsubscribe = subscribeSetlists(() => setSetlists(loadSetlists()))
    void hydrateSetlists()
    return unsubscribe
  }, [])
  return setlists
}

export function useServiceDays(): number[] {
  const [days, setDays] = useState<number[]>(() => loadServiceDays())
  useEffect(() => subscribeSetlists(() => setDays(loadServiceDays())), [])
  return days
}
