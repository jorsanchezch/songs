import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { completeSpotifyLogin } from '@/lib/spotify'

export function SpotifyCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const next = await completeSpotifyLogin(params)
        if (cancelled) return
        navigate(next, { replace: true })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'No pude conectar con Spotify.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4 text-destructive">{error}</p>
        <Button asChild>
          <Link to="/listas">Volver a las listas</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center text-muted-foreground">
      Conectando con Spotify…
    </div>
  )
}
