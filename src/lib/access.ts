export type Role = 'owner' | 'admin' | 'viewer'

export type Crud = 'create' | 'read' | 'update' | 'delete'

export type Account = {
  id: string
  name: string
  role: Role
}

/** The only account. Owner includes every admin control. */
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

export function roleLabel(role: Role): string {
  if (role === 'owner') return 'Dueño'
  if (role === 'admin') return 'Admin'
  return 'Lectura'
}
