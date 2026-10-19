export type Role = 'owner' | 'admin' | 'viewer'

export type Crud = 'create' | 'read' | 'update' | 'delete'

export type Account = {
  id: string
  name: string
  role: Role
}

/** Seeded owner. Other people sign in by name and start as viewers. */
export const currentUser: Account = {
  id: 'jorge',
  name: 'Jorge Sanchez',
  role: 'owner',
}

const allowed: Record<Crud, readonly Role[]> = {
  read: ['owner', 'admin', 'viewer'],
  create: ['owner', 'admin'],
  update: ['owner', 'admin'],
  delete: ['owner', 'admin'],
}

export function can(user: Account, action: Crud): boolean {
  return allowed[action].includes(user.role)
}

export function isStaff(user: Account): boolean {
  return user.role === 'owner' || user.role === 'admin'
}

export function roleLabel(role: Role): string {
  if (role === 'owner') return 'Dueño'
  if (role === 'admin') return 'Admin'
  return 'Lectura'
}
