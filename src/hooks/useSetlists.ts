import { useEffect, useState } from 'react'
import {
  hydrateSetlists,
  loadDayListHistory,
  loadServiceDays,
  loadSetlists,
  subscribeSetlists,
  type DayListHistory,
  type Setlist,
} from '@/lib/setlists'

export function useSetlists(): Setlist[] {
  const [setlists, setSetlists] = useState<Setlist[]>(() => loadSetlists())
  useEffect(() => {
    const unsubscribe = subscribeSetlists(() => setSetlists(loadSetlists()))
    void hydrateSetlists()
    return unsubscribe
  }, [])
  return setlists
}

export function useDayListHistory(): DayListHistory[] {
  const [history, setHistory] = useState<DayListHistory[]>(() => loadDayListHistory())
  useEffect(() => subscribeSetlists(() => setHistory(loadDayListHistory())), [])
  return history
}

export function useServiceDays(): number[] {
  const [days, setDays] = useState<number[]>(() => loadServiceDays())
  useEffect(() => subscribeSetlists(() => setDays(loadServiceDays())), [])
  return days
}
