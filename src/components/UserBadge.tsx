import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { useSession, useUser } from '@/hooks/useUser'
import { roleLabel } from '@/lib/access'

export function UserBadge() {
  const user = useUser()
  const { people, signIn, signOut } = useSession()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  const enter = async (next: string, secret?: string) => {
    const trimmed = next.trim()
    if (!trimmed) return
    setBusy(true)
    setError('')
    try {
      await signIn(trimmed, secret)
      setName('')
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
            Un nombre nuevo entra como lectura, sin contraseña. Si la cuenta tiene contraseña, hay que escribirla.
          </p>
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void enter(name, password)
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre"
              aria-label="Nombre para entrar"
              autoComplete="username"
            />
            <PasswordInput
              ref={passwordRef}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Contraseña, si tiene"
              aria-label="Contraseña, si tiene"
              autoComplete="current-password"
            />
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
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
                      if (person.hasPassword) {
                        setName(person.name)
                        setPassword('')
                        setError('')
                        passwordRef.current?.focus()
                        return
                      }
                      void enter(person.name)
                    }}
                  >
                    <span>{person.name}</span>
                    <span className="text-muted-foreground">
                      {roleLabel(person.role)}
                      {person.hasPassword ? ' · clave' : ''}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}
