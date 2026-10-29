import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SignInGate({
  onEnter,
}: {
  onEnter: (username: string, password: string) => Promise<void>
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await onEnter(username, password)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No pude entrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 py-16">
      <h1 className="mb-1 text-lg font-semibold">Entrar a Songbook</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Entra con tu usuario y contraseña. Las cuentas las crea un Admin.
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Input
          value={username}
          onChange={(event) => {
            setUsername(event.target.value)
            if (error) setError('')
          }}
          placeholder="Usuario"
          aria-label="Usuario"
          autoComplete="username"
        />
        <Input
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            if (error) setError('')
          }}
          placeholder="Contraseña"
          aria-label="Contraseña"
          autoComplete="current-password"
        />
        <Button type="submit" disabled={busy || !username.trim() || !password.trim()}>
          Entrar
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  )
}
