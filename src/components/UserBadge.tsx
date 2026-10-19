import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSession, useUser } from '@/hooks/useUser'
import { roleLabel } from '@/lib/access'

export function UserBadge() {
  const user = useUser()
  const { people, signIn } = useSession()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const enter = async (next: string) => {
    const trimmed = next.trim()
    if (!trimmed) return
    setBusy(true)
    setError('')
    try {
      await signIn(trimmed)
      setName('')
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
        <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl border bg-card p-3 text-left shadow-lg">
          <p className="mb-2 text-xs text-muted-foreground">
            Un nombre nuevo entra como lectura. Puede copiar canciones, no el catálogo.
          </p>
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void enter(name)
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre"
              aria-label="Nombre para entrar"
            />
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              Entrar
            </Button>
          </form>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <ul className="mt-2 flex flex-col">
            {people
              .filter((person) => person.id !== user.id)
              .map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs hover:bg-accent"
                    onClick={() => void enter(person.name)}
                  >
                    <span>{person.name}</span>
                    <span className="text-muted-foreground">{roleLabel(person.role)}</span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}
