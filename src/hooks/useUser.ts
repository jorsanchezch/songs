import { currentUser } from '@/lib/access'

export function useUser() {
  return currentUser
}
