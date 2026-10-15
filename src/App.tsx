import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LibraryView } from '@/components/LibraryView'
import { SongView } from '@/components/SongView'

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '')
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<LibraryView />} />
        <Route path="/c/:songId" element={<SongView />} />
      </Routes>
    </BrowserRouter>
  )
}
