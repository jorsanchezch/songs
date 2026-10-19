import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionContext } from '@/hooks/useUser'
import { type Account } from '@/lib/access'
import { bootSession, getPrefs, listUsers, signIn as signInApi } from '@/lib/api'
import { setCurrentUser } from '@/lib/currentSession'
import { migrateLocalSongs } from '@/lib/migrateLocal'
import { loadSettings, saveSettings } from '@/lib/settings'
import { hydrateSetlists } from '@/lib/setlists'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null)
  const [people, setPeople] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

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
        if (!cancel) setError(reason instanceof Error ? reason.message : 'No pude abrir la base.')
      }
    })()
    return () => {
      cancel = true
    }
  }, [apply, attempt])

  const signIn = useCallback(
    async (name: string) => {
      const next = await signInApi(name)
      await apply(next)
    },
    [apply],
  )

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

  return <SessionContext.Provider value={{ user, people, signIn }}>{children}</SessionContext.Provider>
}
