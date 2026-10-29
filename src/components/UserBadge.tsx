import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSession, useUser } from '@/hooks/useUser'
import { roleLabel } from '@/lib/access'

export function UserBadge() {
  const user = useUser()
  const { people, signIn, signOut } = useSession()
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  const enter = async (nextUser: string, secret: string) => {
    const trimmed = nextUser.trim()
    if (!trimmed || !secret.trim()) return
    setBusy(true)
    setError('')
    try {
      await signIn(trimmed, secret)
      setUsername('')
      setPassword('')
      setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pude entrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs"
        aria-expanded={open}
        aria-label="Cambiar de persona"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="font-medium">{user.name}</span>
        <span className="text-muted-foreground">{roleLabel(user.role)}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-72 rounded-xl border bg-card p-3 text-left shadow-lg">
          <p className="mb-2 text-xs text-muted-foreground">
            Entra con usuario y contraseña. Un Admin crea las cuentas.
          </p>
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void enter(username, password)
            }}
          >
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Usuario"
              aria-label="Usuario para entrar"
              autoComplete="username"
            />
            <Input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Contraseña"
              aria-label="Contraseña"
              autoComplete="current-password"
            />
            <Button type="submit" size="sm" disabled={busy || !username.trim() || !password.trim()}>
              Entrar
            </Button>
          </form>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <Link to="/perfil" className="underline-offset-2 hover:underline" onClick={() => setOpen(false)}>
              Tu perfil
            </Link>
            <button type="button" className="text-muted-foreground hover:underline" onClick={() => void signOut()}>
              Salir
            </button>
          </div>
          <ul className="mt-2 flex flex-col">
            {people
              .filter((person) => person.id !== user.id)
              .map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs hover:bg-accent"
                    onClick={() => {
                      setUsername(person.username)
                      setPassword('')
                      setError('')
                      passwordRef.current?.focus()
                    }}
                  >
                    <span className="truncate text-left">
                      {person.name}
                      <span className="text-muted-foreground"> · {person.username}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">{roleLabel(person.role)}</span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}
