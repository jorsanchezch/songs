import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { SignInGate } from '@/components/SignInGate'
import { Button } from '@/components/ui/button'
import { SessionContext } from '@/hooks/useUser'
import { type Account } from '@/lib/access'
import { bootSession, getPrefs, listUsers, signIn as signInApi, signOut as signOutApi } from '@/lib/api'
import { setCurrentUser } from '@/lib/currentSession'
import { migrateLocalSongs } from '@/lib/migrateLocal'
import { loadSettings, saveSettings } from '@/lib/settings'
import { hydrateSetlists } from '@/lib/setlists'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null)
  const [people, setPeople] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [signedOut, setSignedOut] = useState(false)
  const userRef = useRef<Account | null>(null)
  userRef.current = user

  const apply = useCallback(async (next: Account) => {
    setCurrentUser(next)
    if (next.role === 'owner') {
      try {
        await migrateLocalSongs()
      } catch (reason) {
        console.error(reason)
      }
    }
    try {
      const prefs = await getPrefs()
      if (prefs.prefs) {
        const settings = loadSettings()
        saveSettings({
          ...settings,
          semitones: prefs.prefs.semitones,
          chordShapes: prefs.prefs.chordShapes,
        })
      }
    } catch (reason) {
      console.error(reason)
    }
    await hydrateSetlists()
    setPeople(await listUsers())
    setUser(next)
  }, [])

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const next = await bootSession()
        if (cancel) return
        await apply(next)
      } catch (reason) {
        if (cancel) return
        const message = reason instanceof Error ? reason.message : 'No pude abrir la base.'
        if (/contraseña/i.test(message)) setSignedOut(true)
        else setError(message)
      }
    })()
    return () => {
      cancel = true
    }
  }, [apply, attempt])

  const signIn = useCallback(
    async (name: string, password?: string) => {
      const next = await signInApi(name, password)
      await apply(next)
      setSignedOut(false)
    },
    [apply],
  )

  const signOut = useCallback(async () => {
    try {
      await signOutApi()
    } finally {
      setUser(null)
      setPeople([])
      setSignedOut(true)
    }
  }, [])

  const reloadPeople = useCallback(async () => {
    setPeople(await listUsers())
  }, [])

  const adopt = useCallback((next: Account) => {
    setPeople((current) => current.map((person) => (person.id === next.id ? next : person)))
    if (userRef.current?.id === next.id) {
      setCurrentUser(next)
      setUser(next)
    }
  }, [])

  if (signedOut) return <SignInGate onEnter={signIn} />

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-2 font-medium text-destructive">No se abrió la base</p>
        <p className="mb-6 text-sm text-muted-foreground">{error}</p>
        <Button
          onClick={() => {
            setError('')
            setAttempt((value) => value + 1)
          }}
        >
          Reintentar
        </Button>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground" role="status">
        <Loader2 className="size-8 animate-spin" />
        <p>Abriendo Songbook…</p>
      </div>
    )
  }

  return (
    <SessionContext.Provider value={{ user, people, signIn, signOut, reloadPeople, adopt }}>
      {children}
    </SessionContext.Provider>
  )
}
