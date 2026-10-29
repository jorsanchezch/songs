export type Role = 'owner' | 'admin' | 'viewer'

export type Crud = 'create' | 'read' | 'update' | 'delete'

export type Account = {
  id: string
  name: string
  username: string
  role: Role
  hasPassword: boolean
}

/** Seeded owner. Other people are created from the admin panel. */
export const currentUser: Account = {
  id: 'jorge',
  name: 'Jorge Sanchez',
  username: 'jsanchezch',
  role: 'owner',
  hasPassword: true,
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

/** Seeded Admin account. Nobody can change its role, password, or delete it. */
export function isImmutableAdmin(id: string): boolean {
  return id === currentUser.id
}

export function roleLabel(role: Role): string {
  if (role === 'owner') return 'Admin'
  if (role === 'admin') return 'Ayudante'
  return 'Lectura'
}
