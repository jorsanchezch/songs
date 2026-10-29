import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AdminView } from '@/components/AdminView'
import { BulkLinksView } from '@/components/BulkLinksView'
import { LibraryView } from '@/components/LibraryView'
import { SuggestChartsView } from '@/components/SuggestChartsView'
import { ProfileView } from '@/components/ProfileView'
import { SessionProvider } from '@/hooks/SessionProvider'
import { ServiceDaysView } from '@/components/ServiceDaysView'
import { SetlistView } from '@/components/SetlistView'
import { SetlistsView } from '@/components/SetlistsView'
import { SongEditor } from '@/components/SongEditor'
import { SongView } from '@/components/SongView'
import { StudyIndex, StudyView } from '@/components/StudyView'

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '')
  return (
    <BrowserRouter basename={basename}>
      <SessionProvider>
      <Routes>
        <Route path="/" element={<LibraryView />} />
        <Route path="/admin" element={<AdminView />} />
        <Route path="/perfil" element={<ProfileView />} />
        <Route path="/listas" element={<SetlistsView />} />
        <Route path="/listas/dias" element={<ServiceDaysView />} />
        <Route path="/listas/:setlistId" element={<SetlistView />} />
        <Route path="/nueva" element={<SongEditor />} />
        <Route path="/agregar/enlaces" element={<BulkLinksView />} />
        <Route path="/agregar/sugerencias" element={<SuggestChartsView />} />
        <Route path="/estudio" element={<StudyIndex />} />
        <Route path="/estudio/:instrumento" element={<StudyView />} />
        <Route path="/c/:songId" element={<SongView />} />
        <Route path="/editar/:songId" element={<SongEditor />} />
      </Routes>
      <EscapeFallback />
      <AppVersionFooter />
      </SessionProvider>
    </BrowserRouter>
  )
}

/** Hidden on the song page so the part footer and playback dock have the bottom edge. */
function AppVersionFooter() {
  const location = useLocation()
  const version = import.meta.env.VITE_APP_VERSION
  const commit = import.meta.env.VITE_APP_COMMIT
  if (/^\/c\//.test(location.pathname)) return null
  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 flex h-8 items-center justify-center border-t bg-background/95 text-[11px] text-muted-foreground">
      {commit ? (
        <a
          href={`https://github.com/jorsanchezch/songs/commit/${commit}`}
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:underline"
        >
          Versión {version}
        </a>
      ) : (
        <span>Versión {version}</span>
      )}
    </footer>
  )
}

function EscapeFallback() {
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select'))
      ) {
        return
      }
      const here = `${window.location.pathname}${window.location.search}`
      window.setTimeout(() => {
        if (`${window.location.pathname}${window.location.search}` !== here) return
        const index = window.history.state?.idx
        if (typeof index === 'number' && index > 0) navigate(-1)
        else navigate('/')
      }, 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
  return null
}
