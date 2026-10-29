# Songbook

Songbook es para leer acordes mientras se canta. Los archivos `.cho` y `.chopro` del directorio padre se copian al construir. Las canciones nuevas van en `content/` como `.song.md` (ver [el formato](../chord-songbook-requirements.md)). `_plantilla.song.md` es un modelo y no entra en la biblioteca.

## Desarrollo

```bash
npm install
npm run dev
```

Abre http://127.0.0.1:4322/

## Publicar

Al empujar a `main`, GitHub Actions publica el frontend en GitHub Pages y el Worker en Cloudflare (`deploy-pages.yml` y `deploy-worker.yml`). El sitio de Pages es estático; la API vive en el Worker.

Secretos del repositorio (Settings → Secrets and variables → Actions), o desde tu máquina con `gh` autenticado como dueño del repo:

```bash
# Account ID de la cuenta (barra lateral del dashboard), NO el database_id de D1
printf '%s' 'TU_ACCOUNT_ID' | gh secret set CLOUDFLARE_ACCOUNT_ID -R jorsanchezch/songs
printf '%s' 'TU_API_TOKEN' | gh secret set CLOUDFLARE_API_TOKEN -R jorsanchezch/songs
```

`CLOUDFLARE_API_TOKEN` = token con plantilla **Edit Cloudflare Workers**. `CLOUDFLARE_ACCOUNT_ID` = Account ID (en este proyecto: `a3568bed2d3a17ee343a6714d68c15f2`). El UUID en `wrangler.toml` es solo el `database_id` de D1.

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

### Copia de seguridad

Después de un cambio importante:

```bash
npm run db:backup
```

Escribe un `.sql` en `data/` (esa carpeta no entra en git). Con la base local lee `data/songbook.sqlite`. Con `SONGBOOK_DB=d1` exporta la base remota usando la sesión de Wrangler que ya tienes. No hay un cron: corre el comando a mano cuando quieras guardar una copia.
