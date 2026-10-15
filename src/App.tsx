import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LibraryView } from '@/components/LibraryView'
import { SongEditor } from '@/components/SongEditor'
import { SongView } from '@/components/SongView'

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '')
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<LibraryView />} />
        <Route path="/nueva" element={<SongEditor />} />
        <Route path="/c/:songId" element={<SongView />} />
        <Route path="/editar/:songId" element={<SongEditor />} />
      </Routes>
    </BrowserRouter>
  )
}
