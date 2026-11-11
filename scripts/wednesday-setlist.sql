-- Lista del miércoles 2026-11-11 (una sola vez vía app_meta).
-- Canciones en tono original en el catálogo; semitones llevan la lista a C / Bb / Bb.
-- Nada Más C→C (0), No hay lugar más alto A→Bb (+1), Vine a adorarte D→Bb (-4).
-- Si la lista anterior ya pasó su service_date, entra al historial antes del replace.

INSERT INTO day_list_history (id, weekday, service_date, position)
SELECT
  'historial-3-' || s.service_date,
  3,
  s.service_date,
  COALESCE((SELECT MAX(position) FROM day_list_history), -1) + 1
FROM setlists s
WHERE s.id = 'servicio-3'
  AND s.service_date IS NOT NULL
  AND date('now') > s.service_date
  AND EXISTS (SELECT 1 FROM setlist_items i WHERE i.setlist_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM day_list_history h WHERE h.id = 'historial-3-' || s.service_date)
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

INSERT INTO day_list_history_items (history_id, position, song_id, semitones)
SELECT
  'historial-3-' || s.service_date,
  i.position,
  i.song_id,
  i.semitones
FROM setlists s
JOIN setlist_items i ON i.setlist_id = s.id
WHERE s.id = 'servicio-3'
  AND s.service_date IS NOT NULL
  AND date('now') > s.service_date
  AND EXISTS (SELECT 1 FROM day_list_history h WHERE h.id = 'historial-3-' || s.service_date)
  AND NOT EXISTS (
    SELECT 1 FROM day_list_history_items hi WHERE hi.history_id = 'historial-3-' || s.service_date
  )
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

DELETE FROM setlist_items
WHERE setlist_id = 'servicio-3'
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

INSERT INTO setlist_items (setlist_id, position, song_id, semitones)
SELECT 'servicio-3', 0, 'charts/Nada Más (Nothing Else) - Cody Carnes', 0
WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

INSERT INTO setlist_items (setlist_id, position, song_id, semitones)
SELECT 'servicio-3', 1, 'charts/No hay lugar más alto - Miel San Marcos', 1
WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

INSERT INTO setlist_items (setlist_id, position, song_id, semitones)
SELECT 'servicio-3', 2, 'charts/Vine a adorarte - Marcela Gandara', -4
WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

UPDATE setlists
SET service_date = '2026-11-11'
WHERE id = 'servicio-3'
  AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'wednesday_list_2026_11_11');

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('wednesday_list_2026_11_11', '1');
