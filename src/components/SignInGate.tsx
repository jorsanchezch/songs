import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'

export function SignInGate({ onEnter }: { onEnter: (name: string, password?: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await onEnter(name, password)
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
        Con tu nombre entras. Si la cuenta tiene contraseña, escríbela. Un nombre nuevo queda en lectura, sin contraseña.
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre"
          aria-label="Nombre"
          autoComplete="username"
        />
        <PasswordInput
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Contraseña, si tiene"
          aria-label="Contraseña, si tiene"
          autoComplete="current-password"
        />
        <Button type="submit" disabled={busy || !name.trim()}>
          Entrar
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  )
}
