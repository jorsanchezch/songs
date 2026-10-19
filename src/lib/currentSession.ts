import type { Account } from '@/lib/access'

export const SESSION_KEY = 'songbook-session'

let current: Account | null = null

export function setCurrentUser(user: Account | null) {
  current = user
}

export function getCurrentUser(): Account | null {
  return current
}
