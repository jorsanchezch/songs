/** Shared note on create flows: auto YouTube/BPM, or paste your own. */
export function SongMediaInfoBanner() {
  return (
    <p
      role="note"
      className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm leading-snug text-foreground"
    >
      Al crear una canción, la app intenta enlazar un vídeo de YouTube en el idioma de la canción y un BPM. También
      puedes pegar tú el enlace de YouTube o un MP3.
    </p>
  )
}
