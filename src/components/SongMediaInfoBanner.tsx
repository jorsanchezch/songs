/** Shared note on create flows: auto YouTube/BPM, or paste your own. */
export function SongMediaInfoBanner() {
  return (
    <p
      role="note"
      className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm leading-snug text-foreground"
    >
      Al crear una canción sin YouTube, la app busca un vídeo en el idioma de la canción y, si lo encuentra, llena la
      duración y el BPM que falten. También puedes pegar el enlace, subir un MP3 o poner la duración en m:ss. El modo
      Duración de reproducción funciona sin audio.
    </p>
  )
}
