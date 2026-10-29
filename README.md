# Songbook

Songbook es para leer acordes mientras se canta. Los archivos `.cho` y `.chopro` del directorio padre se copian al construir. Las canciones nuevas van en `content/` como `.song.md` (ver [el formato](../chord-songbook-requirements.md)). `_plantilla.song.md` es un modelo y no entra en la biblioteca.

## Desarrollo

```bash
npm install
npm run dev
```

Abre http://127.0.0.1:4322/

## Publicar

El workflow de GitHub Actions publica `dist` en GitHub Pages al empujar a `main`. El sitio sigue siendo estático. La base no vive en el navegador ni en Pages.

## Base de datos

Por defecto Songbook usa un archivo SQLite en `data/songbook.sqlite` (gitignored). No hace falta cuenta ni variables. `npm run dev` crea el archivo, siembra a Jorge Sanchez como dueño y copia el catálogo de `public/songs/` en cuatro instrumentos: guitarra acústica, bajo, batería y piano.

`SONGBOOK_DB` cambia el mismo programa:

| Valor | Qué usa |
| --- | --- |
| `sqlite` (omisión) | El archivo local. Cero configuración. |
| `d1` | Un Worker de Cloudflare con D1. Hace falta `SONGBOOK_D1_URL`. |

Con `d1`, Vite solo reenvía `/api` al Worker. El navegador no ve credenciales de D1: el binding `DB` queda en el Worker. GitHub Pages llama al Worker con `VITE_SONGBOOK_API` (la misma URL, sin secreto) en el build.

D1 es el plan gratuito de SQLite de Cloudflare. A diferencia de Neon o Supabase, el proyecto gratuito no se pausa ni caduca por inactividad. El plan tiene cupos diarios que se renuevan; el uso de una persona cabe en ellos. Los números actuales están en [los precios de D1](https://developers.cloudflare.com/d1/platform/pricing/).

### Alta única en Cloudflare

1. Crea una cuenta gratuita en [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. En esta carpeta: `npx wrangler login`.
3. `npx wrangler d1 create songbook` y pega el `database_id` en `wrangler.toml` (hoy dice `replace-me`).
4. `npm run db:export-seed` escribe `data/seed.sql` desde los archivos del catálogo.
5. `npx wrangler d1 execute songbook --remote --file=data/seed.sql`
6. `npx wrangler deploy`. Anota la URL `*.workers.dev`.
7. Para desarrollar contra D1: `SONGBOOK_DB=d1` y `SONGBOOK_D1_URL=https://songbook.<tu-subdominio>.workers.dev`.
8. Para Pages, construye con `VITE_SONGBOOK_API` igual a esa URL. Opcional: en el Worker cambia `SONGBOOK_ORIGIN` de `*` al origen de Pages.

Entrar es por nombre. Jorge Sanchez queda como dueño. Un nombre nuevo entra como lectura: puede crear su copia y sus canciones, y no puede cambiar el catálogo. No pongas la URL del Worker en público si no quieres que cualquiera entre con un nombre.

El workflow de Pages construye con `VITE_SONGBOOK_API=https://songbook.jorsanchezch.workers.dev`, así el sitio publicado llama a D1. GitHub Pages sigue sirviendo solo el frontend.

### Medios: YouTube, BPM, duración, MP3

La reproducción lee `bpm`, `duration_ms`, `audio_url` y la fuente YouTube del **texto del chart** (`parseChart` / `materialize`), no solo de las columnas D1. El relleno escribe ambos. El modo **Duración** usa `duration_ms` y **no necesita** YouTube ni MP3.

1. Crea una clave gratuita de [YouTube Data API v3](https://developers.google.com/youtube/v3/getting-started).
2. En el Worker: `npx wrangler secret put YOUTUBE_API_KEY`.
3. Despliega el Worker (`npx wrangler deploy`).
4. En **Administración → Medios**, pulsa *Completar lote* (o `POST /api/admin/media-backfill`). Rellena YouTube faltante y, en un segundo paso, BPM/duración en canciones que ya tienen video. Cupo ~100 `search.list`/día; el resto queda en cola (`app_meta`).

Sin clave el endpoint sigue existiendo: usa búsqueda pública best-effort (sin duración ISO fiable) y documenta el aviso en la respuesta. En local: `YOUTUBE_API_KEY=… npm run media:backfill`.

### Audio MP3 (R2, no D1)

D1/SQLite solo guarda `audio_url` (texto). Los bytes van a Cloudflare R2 o, en local, a `data/audio/` (gitignored).

1. `npx wrangler r2 bucket create songbook-audio`
2. Descomenta `[[r2_buckets]]` / `AUDIO_BUCKET` en `wrangler.toml` y `npx wrangler deploy`.
3. Sube desde el editor (*Subir MP3*) o `POST /api/audio` (multipart `file`). La API responde `audio_url` tipo `/api/audio/songs/…/….mp3`; `GET` lo sirve desde R2 (público, para `<audio>`).

### YouTube → MP3

El Worker **no** ejecuta yt-dlp. Con YouTube y sin audio:

- Local/CI: instala `yt-dlp` (+ `ffmpeg`) y corre `npm run media:extract-audio` (o Admin → *Extraer MP3* cuando `ALLOW_YT_EXTRACT` está activo en el servidor Node).
- En el Worker, Admin → *Extraer MP3* responde bloqueado y apunta a ese script.

Sin R2 ni `data/audio`, la extracción y la subida fallan a propósito: no se vuelcan MP3 a D1.

### Copia de seguridad

Después de un cambio importante:

```bash
npm run db:backup
```

Escribe un `.sql` en `data/` (esa carpeta no entra en git). Con la base local lee `data/songbook.sqlite`. Con `SONGBOOK_DB=d1` exporta la base remota usando la sesión de Wrangler que ya tienes. No hay un cron: corre el comando a mano cuando quieras guardar una copia.
