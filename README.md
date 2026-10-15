# Songbook

Songbook es para leer acordes mientras se canta. Los archivos `.cho` y `.chopro` del directorio padre se copian al construir. Las canciones nuevas van en `content/` como `.song.md` (ver [el formato](../chord-songbook-requirements.md)). `_plantilla.song.md` es un modelo y no entra en la biblioteca.

## Desarrollo

```bash
npm install
npm run dev
```

Abre http://127.0.0.1:4322/

## Publicar

El workflow de GitHub Actions publica `dist` en GitHub Pages al empujar a `main`.
