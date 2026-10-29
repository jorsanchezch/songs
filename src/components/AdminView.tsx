import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Loader2, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Segmented } from '@/components/ui/segmented'
import { UserBadge } from '@/components/UserBadge'
import { useSession, useUser } from '@/hooks/useUser'
import { isImmutableAdmin, isStaff, roleLabel, type Role } from '@/lib/access'
import {
  createPerson,
  getAdmin,
  getAudioExtract,
  getMediaBackfill,
  removePerson,
  runAudioExtract,
  runMediaBackfill,
  updatePerson,
  type AdminOverview,
  type AdminPerson,
  type AudioExtractReport,
  type MediaBackfillReport,
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
      'En este panel crea personas (usuario, nombre y contraseña), cambia roles y quita a quien no es Admin.',
      'No puede dejar el grupo sin Admin, ni borrar a un Admin.',
    ],
  },
  {
    role: 'admin',
    points: [
      'Con el catálogo, las copias, las listas y los días de servicio puede lo mismo que el Admin.',
      'En este panel crea personas de Lectura o Ayudante, cambia el rol de quien no es Admin, pone su contraseña y lo quita.',
      'No cambia el rol del Admin, no lo borra y no le cambia la contraseña.',
      'No nombra Admins ni importa la biblioteca de este navegador.',
    ],
  },
  {
    role: 'viewer',
    points: [
      'Ve el catálogo, salvo las canciones ocultas, sus canciones y las copias compartidas con todos o con esa persona.',
      'Crea canciones propias y copias, con YouTube, BPM, duración y MP3. Edita lo suyo y lo compartido. Borra sus copias y canciones propias, no el catálogo.',
      'Al editar una canción del catálogo guarda su versión personal: solo esa persona la ve y la canción compartida no cambia. Un Admin o un Ayudante la revisa en Versiones de usuarios.',
      'Comparte sus propias copias, con todos o con una persona.',
      'Ve las listas y los días de servicio. No los cambia.',
      'No abre este panel. Entra solo con el usuario y la contraseña que le dio un Admin.',
    ],
  },
]

const INVENTORY: { key: keyof AdminOverview['inventory']; label: string }[] = [
  { key: 'users', label: 'Personas' },
  { key: 'catalogSongs', label: 'Canciones del catálogo' },
  { key: 'personalCopies', label: 'Copias personales' },
  { key: 'sharedCopies', label: 'Copias compartidas' },
  { key: 'createdSongs', label: 'Canciones propias' },
  { key: 'userVersions', label: 'Versiones de usuarios' },
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
    href: 'https://dash.cloudflare.com/?to=/:account/r2/default/buckets/songbook-audio',
    label: 'Audio R2 songbook-audio',
    detail:
      'Bucket R2 donde viven los MP3 (binding AUDIO_BUCKET). D1 solo guarda audio_url; en local los archivos van a data/audio/.',
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
  {
    href: 'https://github.com/jorsanchezch/songs/actions/workflows/deploy-worker.yml',
    label: 'Despliegue del Worker',
    detail: 'Workflow de GitHub Actions que publica la API en Cloudflare.',
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

            <UserVersions drafts={overview.drafts} />

            <CreatePerson
              actorRole={user.role}
              onCreate={(body) => run(() => createPerson(body), 'Persona creada.')}
            />

            <MediaBackfillPanel />

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
                    key={`${person.id}:${person.role}:${person.username}:${person.hasPassword}`}
                    person={person}
                    actorRole={user.role}
                    actorId={user.id}
                    owners={overview.users.filter((item) => item.role === 'owner').length}
                    onRole={(id, role) => run(() => updatePerson(id, { role }), 'Rol guardado.')}
                    onPassword={(id, password) =>
                      run(() => updatePerson(id, { password }), 'Contraseña guardada.')
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

function MediaBackfillPanel() {
  const [status, setStatus] = useState<MediaBackfillReport | null>(null)
  const [report, setReport] = useState<MediaBackfillReport | null>(null)
  const [extract, setExtract] = useState<AudioExtractReport | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancel = false
    void Promise.all([getMediaBackfill(), getAudioExtract()])
      .then(([next, audio]) => {
        if (cancel) return
        setStatus(next)
        setExtract(audio)
      })
      .catch((reason) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'No pude leer el estado del relleno.')
      })
    return () => {
      cancel = true
    }
  }, [])

  const run = async (dryRun: boolean) => {
    setBusy(true)
    setError('')
    try {
      const next = await runMediaBackfill({ limit: 20, dryRun })
      setReport(next)
      setStatus(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pude completar el relleno.')
    } finally {
      setBusy(false)
    }
  }

  const runExtract = async (dryRun: boolean) => {
    setBusy(true)
    setError('')
    try {
      const next = await runAudioExtract({ limit: 10, dryRun })
      setExtract(next)
      if (next.blocked) {
        setError(next.note || 'Extracción bloqueada en este entorno.')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pude extraer audio.')
    } finally {
      setBusy(false)
    }
  }

  const shown = report ?? status

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Medios (YouTube / duración / BPM / MP3)</h2>
      <p className="text-sm text-muted-foreground">
        Rellena YouTube, duración y BPM (también en canciones que ya tienen video pero sin BPM). Escribe los campos en el
        texto del chart para que la reproducción los lea. Cupo ~100 búsquedas/día con la clave de YouTube. Los MP3 van a
        R2 (o <code className="text-xs">data/audio</code> en local), nunca a D1; <code className="text-xs">audio_url</code>{' '}
        apunta al objeto. YouTube→MP3 necesita yt-dlp fuera del Worker.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {shown && (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <p>
            Sin YouTube: <strong>{shown.missingBefore}</strong>
            {' · '}
            Cupo hoy: {shown.searchQuota.used}/{shown.searchQuota.limit} (quedan {shown.searchQuota.remaining})
            {' · '}
            Cola: {shown.queueSize}
          </p>
          <p className="mt-1 text-muted-foreground">
            Clave YouTube: {shown.apiKeyPresent ? 'sí' : 'no'} · R2: {shown.r2Configured ? 'sí' : 'no'}
            {extract ? ` · Sin MP3 (con YouTube): ${extract.missingAudio}` : ''}
          </p>
          {shown.note && <p className="mt-2 text-muted-foreground">{shown.note}</p>}
          {extract?.note && <p className="mt-2 text-muted-foreground">{extract.note}</p>}
          {report && (
            <p className="mt-2">
              Última corrida{report.dryRun ? ' (simulación)' : ''}: {report.updated} actualizadas, {report.skipped}{' '}
              omitidas, {report.queued} en cola, {report.errors} errores.
            </p>
          )}
          {report && report.results.length > 0 && (
            <ul className="mt-3 max-h-48 list-disc overflow-y-auto pl-5 text-muted-foreground">
              {report.results.slice(0, 40).map((item) => (
                <li key={`${item.id}:${item.status}:${item.youtubeUrl ?? ''}`}>
                  {item.title}: {item.status}
                  {item.bpm != null ? ` · ${item.bpm} BPM` : ''}
                  {item.youtubeUrl ? ` → ${item.youtubeUrl}` : ''}
                  {item.reason ? ` (${item.reason})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run(true)}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Simular lote
        </Button>
        <Button type="button" disabled={busy} onClick={() => void run(false)}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Completar lote
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          title="YouTube → MP3. En el Worker queda bloqueado; en local/CI con yt-dlp sí corre."
          onClick={() => void runExtract(false)}
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          Extraer MP3
        </Button>
      </div>
    </section>
  )
}

function UserVersions({ drafts }: { drafts: AdminOverview['drafts'] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Versiones de usuarios</h2>
      <p className="text-sm text-muted-foreground">
        Quien no puede cambiar una canción compartida guarda su propia versión. Solo esa persona la ve. Abre una canción
        para ver cada campo que cambió y, si quieres, llevar la versión al editor.
      </p>
      {!drafts.length ? (
        <p className="text-sm">Nadie guardó una versión propia todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {drafts.map((item) => (
            <li key={item.songId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.users.map((person) => person.name).join(', ')}</p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link to={`/c/${encodeURIComponent(item.songId)}/versiones`}>Ver versiones</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
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
  onCreate: (body: { name: string; username: string; role: Role; password: string }) => Promise<void>
}) {
  const roles: Role[] = actorRole === 'owner' ? ['viewer', 'admin', 'owner'] : ['viewer', 'admin']
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
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
          const trimmedName = name.trim()
          const trimmedUser = username.trim()
          const trimmedPass = password.trim()
          if (!trimmedName || !trimmedUser || !trimmedPass) return
          setBusy(true)
          void onCreate({
            name: trimmedName,
            username: trimmedUser,
            role,
            password: trimmedPass,
          }).then(
            () => {
              setName('')
              setUsername('')
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
        <Input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Usuario"
          aria-label="Usuario de la persona"
          autoComplete="off"
        />
        <Segmented
          value={role}
          onValueChange={setRole}
          options={roles.map((item) => ({ value: item, label: roleLabel(item) }))}
          aria-label="Rol"
          className="h-10 items-center self-start"
        />
        <PasswordInput
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Contraseña"
          aria-label="Contraseña"
          autoComplete="new-password"
        />
        <Button
          type="submit"
          className="sm:col-span-2"
          disabled={busy || !name.trim() || !username.trim() || !password.trim()}
        >
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
  onPassword: (id: string, password: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [role, setRole] = useState<Role>(person.role)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const onlyOwner = person.role === 'owner' && owners <= 1
  const lockedOwner = actorRole !== 'owner' && person.role === 'owner'
  const immutable = isImmutableAdmin(person.id)
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
          @{person.username} · {roleLabel(person.role)} ·{' '}
          {person.hasPassword ? 'Con contraseña' : 'Sin contraseña'}
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
      {immutable && (
        <p className="text-sm text-muted-foreground">La cuenta de Admin no se cambia ni se quita.</p>
      )}
      {!immutable && lockedOwner && (
        <p className="text-sm text-muted-foreground">Un Ayudante no cambia el rol, la contraseña ni la cuenta del Admin.</p>
      )}
      {!immutable && !lockedOwner && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void wrap(() => onRole(person.id, role))
          }}
        >
          <Segmented
            value={role}
            onValueChange={setRole}
            disabled={onlyOwner || busy}
            options={roleChoices.map((item) => ({ value: item, label: roleLabel(item) }))}
            aria-label={`Rol de ${person.name}`}
            className="h-10 items-center"
          />
          <Button type="submit" size="sm" variant="outline" disabled={busy || onlyOwner || role === person.role}>
            Guardar rol
          </Button>
          {onlyOwner && <span className="text-xs text-muted-foreground">Es el único Admin. El rol se queda.</span>}
        </form>
      )}
      {!immutable && !lockedOwner && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!password.trim()) return
            void wrap(() => onPassword(person.id, password))
          }}
        >
          <PasswordInput
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
        </form>
      )}
      {!immutable && person.role !== 'owner' && (
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
