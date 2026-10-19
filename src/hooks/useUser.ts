import { createContext, useContext } from 'react'
import type { Account } from '@/lib/access'

export type SessionValue = {
  user: Account
  people: Account[]
  signIn: (name: string) => Promise<void>
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('No hay sesión')
  return value
}

export function useUser(): Account {
  return useSession().user
}
