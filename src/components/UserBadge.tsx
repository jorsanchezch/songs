import { roleLabel } from '@/lib/access'
import { useUser } from '@/hooks/useUser'

export function UserBadge() {
  const user = useUser()
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs">
      <span className="font-medium">{user.name}</span>
      <span className="text-muted-foreground">{roleLabel(user.role)}</span>
    </span>
  )
}
