import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LibraryView } from '@/components/LibraryView'
import { SongEditor } from '@/components/SongEditor'
import { SongView } from '@/components/SongView'

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '')
  const version = import.meta.env.VITE_APP_VERSION
  const commit = import.meta.env.VITE_APP_COMMIT
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<LibraryView />} />
        <Route path="/nueva" element={<SongEditor />} />
        <Route path="/c/:songId" element={<SongView />} />
        <Route path="/editar/:songId" element={<SongEditor />} />
      </Routes>
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
    </BrowserRouter>
  )
}
