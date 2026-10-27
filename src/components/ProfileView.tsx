import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserBadge } from '@/components/UserBadge'
import { useSession, useUser } from '@/hooks/useUser'
import { roleLabel } from '@/lib/access'
import { putPassword } from '@/lib/api'

const page = 'mx-auto w-full max-w-[52.8rem] px-4'

export function ProfileView() {
  const user = useUser()
  const { adopt, signOut } = useSession()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (next: string | null) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const updated = await putPassword(next)
      adopt(updated)
      setPassword('')
      setNotice(updated.hasPassword ? 'Contraseña guardada.' : 'Contraseña quitada. Con tu nombre entras.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pude guardar la contraseña.')
    } finally {
      setBusy(false)
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
          <h1 className="text-lg font-semibold">Perfil</h1>
          <div className="ml-auto">
            <UserBadge />
          </div>
        </div>
      </header>
      <main className={`${page} flex max-w-md flex-col gap-4 py-4`}>
        <section className="rounded-xl border bg-card p-4">
          <p className="text-lg font-medium">{user.name}</p>
          <p className="text-sm text-muted-foreground">{roleLabel(user.role)}</p>
          <p className="mt-2 text-sm">
            {user.hasPassword
              ? 'Tienes contraseña. Con el nombre no basta para entrar.'
              : 'Sin contraseña. Con tu nombre entras.'}
          </p>
        </section>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!password.trim()) {
              setError('Escribe una contraseña.')
              setNotice('')
              return
            }
            void save(password)
          }}
        >
          <label className="text-sm font-medium" htmlFor="profile-password">
            Nueva contraseña
          </label>
          <Input
            id="profile-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Contraseña nueva"
            autoComplete="new-password"
          />
          <Button type="submit" disabled={busy || !password.trim()}>
            Guardar contraseña
          </Button>
        </form>
        {user.hasPassword && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('¿Quitar tu contraseña? Con el nombre basta para entrar.')) return
              void save(null)
            }}
          >
            Quitar contraseña
          </Button>
        )}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="outline" onClick={() => void signOut()}>
          Salir
        </Button>
      </main>
    </div>
  )
}
