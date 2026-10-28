import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Loader2, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserBadge } from '@/components/UserBadge'
import { useSession, useUser } from '@/hooks/useUser'
import { isStaff, roleLabel, type Role } from '@/lib/access'
import {
  createPerson,
  getAdmin,
  removePerson,
  updatePerson,
  type AdminOverview,
  type AdminPerson,
} from '@/lib/api'

const page = 'mx-auto w-full max-w-[52.8rem] px-4'

const ROLE_GUIDE: { role: Role; points: string[] }[] = [
  {
    role: 'owner',
    points: [
      'Edita, oculta y restaura el catálogo, y puede volver a mostrar las canciones ocultas.',
      'Crea canciones y copias. Edita, borra y comparte cualquier copia.',
      'Cambia las listas y los días de servicio.',
      'Importa la biblioteca de este navegador.',
      'En este panel crea personas, cambia roles, pone o quita contraseñas y quita a quien no es Admin.',
      'No puede dejar el grupo sin Admin, ni borrar a un Admin.',
    ],
  },
  {
    role: 'admin',
    points: [
      'Con el catálogo, las copias, las listas y los días de servicio puede lo mismo que el Admin.',
      'En este panel crea personas de Lectura o Ayudante, cambia el rol de quien no es Admin, pone o quita su contraseña y lo quita.',
      'No cambia el rol del Admin, no lo borra y no le cambia la contraseña.',
      'No nombra Admins ni importa la biblioteca de este navegador.',
    ],
  },
  {
    role: 'viewer',
    points: [
      'Ve el catálogo, salvo las canciones ocultas, sus canciones y las copias compartidas con todos o con esa persona.',
      'Crea canciones propias y copias. Edita lo suyo y lo compartido. Borra sus copias y canciones propias, no el catálogo.',
      'Comparte sus propias copias, con todos o con una persona.',
      'Ve las listas y los días de servicio. No los cambia.',
      'No abre este panel. Un nombre nuevo entra así, sin contraseña, hasta que la ponga en su perfil.',
    ],
  },
]

const INVENTORY: { key: keyof AdminOverview['inventory']; label: string }[] = [
  { key: 'users', label: 'Personas' },
  { key: 'catalogSongs', label: 'Canciones del catálogo' },
  { key: 'personalCopies', label: 'Copias personales' },
  { key: 'sharedCopies', label: 'Copias compartidas' },
  { key: 'createdSongs', label: 'Canciones propias' },
  { key: 'setlists', label: 'Listas' },
  { key: 'serviceDays', label: 'Días de servicio' },
]

const INFRA: { href: string; label: string; detail: string }[] = [
  {
    href: 'https://songbook.jorsanchezch.workers.dev',
    label: 'API del Worker',
    detail: 'Cloudflare Worker que atiende la API.',
  },
  {
    href: 'https://dash.cloudflare.com/?to=/:account/workers/d1/databases/a3f3f9f3-33d7-4f07-a94f-cd44a64f483b',
    label: 'Base D1 songbook',
    detail: 'Base de datos D1 songbook en el panel de Cloudflare.',
  },
  {
    href: 'https://github.com/jorsanchezch/songs',
    label: 'Repositorio',
    detail: 'Código en GitHub.',
  },
  {
    href: 'https://jorsanchezch.github.io/songs/',
    label: 'Sitio publicado',
    detail: 'GitHub Pages.',
  },
  {
    href: 'https://github.com/jorsanchezch/songs/actions/workflows/deploy-pages.yml',
    label: 'Despliegue de Pages',
    detail: 'Workflow de GitHub Actions que publica el sitio.',
  },
]

export function AdminView() {
  const user = useUser()
  if (!isStaff(user)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-2 font-medium">Solo un Admin o un Ayudante abre el panel.</p>
        <p className="mb-6 text-sm text-muted-foreground">
          Estás como {user.name}, con rol {roleLabel(user.role)}.
        </p>
        <Button asChild>
          <Link to="/">Volver a la biblioteca</Link>
        </Button>
      </div>
    )
  }
  return <AdminPanel />
}

function AdminPanel() {
  const user = useUser()
  const { adopt, reloadPeople, signOut } = useSession()
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  const applyOverview = async (next: AdminOverview) => {
    setOverview(next)
    adopt(next.me)
    await reloadPeople()
  }

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const next = await getAdmin()
        if (cancel) return
        setOverview(next)
        adopt(next.me)
        await reloadPeople()
      } catch (reason) {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'No pude abrir el panel.')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => {
      cancel = true
    }
  }, [adopt, reloadPeople])

  const run = async (action: () => Promise<AdminOverview>, done: string) => {
    setError('')
    setNotice('')
    try {
      await applyOverview(await action())
      setNotice(done)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pude guardar el cambio.')
      throw reason
    }
  }

  return (
    <div className="min-h-svh pb-12">
      <header className="border-b bg-card/80">
        <div className={`${page} flex items-center gap-3 py-4`}>
          <Button variant="ghost" size="icon" asChild aria-label="Volver">
            <Link to="/">
              <ArrowLeft />
            </Link>
          </Button>
          <Shield className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Administración</h1>
          <div className="ml-auto flex items-center gap-2">
            <UserBadge />
            <Button asChild variant="outline">
              <Link to="/perfil">Perfil</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className={`${page} flex flex-col gap-6 py-4`}>
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground" role="status">
            <Loader2 className="size-8 animate-spin" />
            <p>Abriendo el panel…</p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        {overview && (
          <>
            <section className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Estás en el panel</p>
              <p className="text-lg font-medium">{overview.me.name}</p>
              <p className="text-sm text-muted-foreground">{roleLabel(overview.me.role)}</p>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Qué puede cada rol</h2>
              <div className="grid gap-3">
                {ROLE_GUIDE.map((item) => (
                  <article key={item.role} className="rounded-xl border bg-card p-4">
                    <h3 className="mb-2 font-medium">{roleLabel(item.role)}</h3>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                      {item.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Qué hay</h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {INVENTORY.map((item) => (
                  <li key={item.key} className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-lg font-semibold">{overview.inventory[item.key]}</p>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                Una copia personal no está compartida. Una compartida está abierta para todos o asignada a alguien. Una
                canción propia la creó esa persona: no es una copia del catálogo.
              </p>
            </section>

            <CreatePerson
              actorRole={user.role}
              onCreate={(body) => run(() => createPerson(body), 'Persona creada.')}
            />

            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Personas</h2>
              <p className="text-sm text-muted-foreground">
                Al quitar a alguien se borran sus copias privadas y sus canciones propias que no están compartidas. El
                catálogo no se borra. Lo compartido queda a nombre de un Admin, para que la biblioteca siga abriendo.
                Un Admin no se quita: si hay otro Admin, primero hay que cambiarle el rol.
              </p>
              <div className="flex flex-col gap-3">
                {overview.users.map((person) => (
                  <PersonCard
                    key={`${person.id}:${person.role}:${person.hasPassword}`}
                    person={person}
                    actorRole={user.role}
                    actorId={user.id}
                    owners={overview.users.filter((item) => item.role === 'owner').length}
                    onRole={(id, role) => run(() => updatePerson(id, { role }), 'Rol guardado.')}
                    onPassword={(id, password) =>
                      run(
                        () => updatePerson(id, { password }),
                        password ? 'Contraseña guardada.' : 'Contraseña quitada.',
                      )
                    }
                    onRemove={async (id) => {
                      const name = overview.users.find((item) => item.id === id)?.name ?? 'esta persona'
                      if (
                        !window.confirm(
                          `¿Quitar a ${name}? Se borran sus copias y canciones privadas. El catálogo se queda. Lo compartido pasa a un Admin.`,
                        )
                      ) {
                        return
                      }
                      setError('')
                      setNotice('')
                      try {
                        const next = await removePerson(id)
                        if (id === user.id) {
                          await signOut()
                          return
                        }
                        await applyOverview(next)
                        setNotice('Persona quitada.')
                      } catch (reason) {
                        setError(reason instanceof Error ? reason.message : 'No pude quitar a esa persona.')
                      }
                    }}
                  />
                ))}
              </div>
            </section>
          </>
        )}
        {!loading && <InfraLinks />}
      </main>
    </div>
  )
}

function InfraLinks() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Infraestructura</h2>
      <p className="text-sm text-muted-foreground">
        Enlaces a lo que usa esta aplicación. Cada uno se abre en otra pestaña.
      </p>
      <ul className="flex flex-col gap-2">
        {INFRA.map((item) => (
          <li key={item.label} className="rounded-lg border bg-card px-3 py-2">
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
            >
              {item.label}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
            <p className="text-sm text-muted-foreground">{item.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CreatePerson({
  actorRole,
  onCreate,
}: {
  actorRole: Role
  onCreate: (body: { name: string; role: Role; password?: string }) => Promise<void>
}) {
  const roles: Role[] = actorRole === 'owner' ? ['viewer', 'admin', 'owner'] : ['viewer', 'admin']
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Nueva persona</h2>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          setBusy(true)
          void onCreate({
            name: trimmed,
            role,
            ...(password.trim() ? { password: password.trim() } : {}),
          }).then(
            () => {
              setName('')
              setPassword('')
              setRole('viewer')
              setBusy(false)
            },
            () => setBusy(false),
          )
        }}
      >
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre"
          aria-label="Nombre de la persona"
          autoComplete="off"
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
          className="h-10 rounded-md border bg-background px-2 text-sm"
          aria-label="Rol"
        >
          {roles.map((item) => (
            <option key={item} value={item}>
              {roleLabel(item)}
            </option>
          ))}
        </select>
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Contraseña, opcional"
          aria-label="Contraseña, opcional"
          autoComplete="new-password"
        />
        <Button type="submit" disabled={busy || !name.trim()}>
          Crear persona
        </Button>
      </form>
    </section>
  )
}

function PersonCard({
  person,
  actorRole,
  actorId,
  owners,
  onRole,
  onPassword,
  onRemove,
}: {
  person: AdminPerson
  actorRole: Role
  actorId: string
  owners: number
  onRole: (id: string, role: Role) => Promise<void>
  onPassword: (id: string, password: string | null) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [role, setRole] = useState<Role>(person.role)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const onlyOwner = person.role === 'owner' && owners <= 1
  const lockedOwner = actorRole !== 'owner' && person.role === 'owner'
  const roleChoices: Role[] = actorRole === 'owner' ? ['viewer', 'admin', 'owner'] : ['viewer', 'admin']

  const wrap = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div>
        <h3 className="font-medium">
          {person.name}
          {person.id === actorId ? <span className="text-muted-foreground"> · tú</span> : null}
        </h3>
        <p className="text-sm text-muted-foreground">
          {roleLabel(person.role)} · {person.hasPassword ? 'Con contraseña' : 'Sin contraseña'}
        </p>
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">Copias: </span>
        {songList(person.copies)}
      </p>
      <p className="text-sm">
        <span className="text-muted-foreground">Canciones propias: </span>
        {songList(person.created)}
      </p>
      {person.catalogCount > 0 && (
        <p className="text-sm text-muted-foreground">En el catálogo, a su nombre: {person.catalogCount}</p>
      )}
      {lockedOwner && (
        <p className="text-sm text-muted-foreground">Un Ayudante no cambia el rol, la contraseña ni la cuenta del Admin.</p>
      )}
      {!lockedOwner && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void wrap(() => onRole(person.id, role))
          }}
        >
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            disabled={onlyOwner || busy}
            className="h-10 rounded-md border bg-background px-2 text-sm"
            aria-label={`Rol de ${person.name}`}
          >
            {roleChoices.map((item) => (
              <option key={item} value={item}>
                {roleLabel(item)}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline" disabled={busy || onlyOwner || role === person.role}>
            Guardar rol
          </Button>
          {onlyOwner && <span className="text-xs text-muted-foreground">Es el único Admin. El rol se queda.</span>}
        </form>
      )}
      {!lockedOwner && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!password.trim()) return
            void wrap(() => onPassword(person.id, password))
          }}
        >
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Nueva contraseña"
            aria-label={`Contraseña de ${person.name}`}
            autoComplete="new-password"
            className="sm:max-w-xs"
          />
          <Button type="submit" size="sm" variant="outline" disabled={busy || !password.trim()}>
            Poner contraseña
          </Button>
          {person.hasPassword && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void wrap(() => onPassword(person.id, null))}
            >
              Quitar contraseña
            </Button>
          )}
        </form>
      )}
      {person.role !== 'owner' && (
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={busy}
            onClick={() => void onRemove(person.id)}
          >
            Quitar persona
          </Button>
        </div>
      )}
    </article>
  )
}

function songList(songs: AdminPerson['copies']): string {
  if (!songs.length) return 'Ninguna'
  return songs.map((song) => (song.shared ? `${song.title} (compartida)` : song.title)).join(', ')
}
