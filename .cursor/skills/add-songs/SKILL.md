---
name: add-songs
description: Add worship charts to the Songbook app and replace a Wednesday or Saturday service list. Use when the user sends a lista (miércoles, sábado, or mañana) or asks to add songs, cifras, or a setlist. Archive the outgoing lineup into history before replacing songs.
---

# Add songs to Songbook

Songbook reads ChordPro. A service list is not a markdown file. It is a `.cho` chart plus a one-shot module that runs from `ensureSchema` when the Worker or local server boots.

There is no separate requirements doc in this repo. `content/_plantilla.song.md` is only the model for authored `.song.md` files. Those copy to `public/songs/authored/` and are not how service charts are added. `scripts/wednesday-setlist.sql` and `scripts/saturday-setlist.sql` are not applied by deploy.

## What to add

1. A chart at `public/songs/charts/<Title> - <Artist>.cho`.
2. A module `server/<weekday>List<YYYYMMDD>.ts` that upserts those charts and replaces one evergreen list.
3. A call to that module at the end of `ensureSchema` in `server/seed.ts`, after the older list modules.

Weekday lists:

| Day | List id | Weekday |
| --- | --- | --- |
| Miércoles | `servicio-3` | 3 |
| Sábado | `servicio-6` | 6 |
| Domingo | `servicio-0` | 0 |

The song id is the path under `public/songs/` without the extension, for example `charts/Cordero y León - TWICE`.

## Chart

Match the existing `.cho` files. Required tags: `{title}`, `{artist}`, `{key}`, `{source}` (the page the chords came from). Add `{composer}`, `{bpm}`, and `{duration_ms}` when they are known. Sections are `{start_of_verse}`, `{start_of_chorus}`, `{start_of_bridge}`, `{start_of_intro}`, and the matching `end_of_` tags. Chords go on their own line in brackets, above the lyric.

Keep the chart in the key of the source. Do not invent chords. If the only public chart is in another language, transpose that published chart into the Spanish recording's key and say so in `{comment}` plus a second `{source}`.

Store semitones `0` unless the user names the key they will play. The list transpose is `setlist_items.semitones`, not a rewritten chart.

`npm run dev` and `npm run build` run `scripts/generate-song-manifest.mjs`. That script deletes `public/songs/charts/` and copies `.cho` files from the parent directory when the parent has any. In this repo the charts live in `public/songs/charts/`. Do not leave stray `.cho` files in the parent, or the next manifest run will wipe the catalog.

## Replace the list, and keep history

The Worker does not read `public/songs/` from disk. `ensureSchema` has to upsert the chart text into `songs` and `instrument_parts` (every instrument in `INSTRUMENTS`). Copy `upsertCatalogSong` from `server/wednesdayList20261125.ts`.

The module runs once. Guard it with `app_meta`, key `wednesday_list_YYYY_MM_DD` or `saturday_list_YYYY_MM_DD`. Upsert charts on every boot. Archive, delete, and insert list rows only when that key is missing.

Before `DELETE FROM setlist_items`, call `archiveReplacedDayList` from `server/dayListArchive.ts`. Replacing the lineup closes the previous one. Do this even when the stored service date is today or still ahead. `dayListIsDue` is only the in-app rule for adding one more song the day after a service (`planEvergreenAdd`). A full list update must not use that gate.

`archiveReplacedDayList` copies `song_id`, `semitones`, and order into `day_list_history` / `day_list_history_items`. The history id is `historial-<weekday>-<service date>`. A date already stored is left alone, so a second edit cannot wipe the snapshot. An empty list is skipped. A list with songs but no date is stored under the church today (`America/Santo_Domingo`).

Then delete that list's items, insert the new songs in the user's order, and set `service_date` plus `name` with `serviceListTitle`. `seedServices` runs at the start of `ensureSchema`, so `servicio-3` and `servicio-6` exist before the insert.

Service date: the Wednesday or Saturday they named. If they say "mañana" and today in Santo Domingo is already that weekday, use today.

## Check

`npm run check` parses every chart and seeds an in-memory database. The new list must be the evergreen row, and the previous lineup must be in `day_list_history`.

Do not add another `scripts/*-setlist.sql`. Deploy does not run those files.
